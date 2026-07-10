"""LLM-native tool router via Groq OpenAI-compatible tool calling.

Replaces regex intent matching: the model sees tool descriptions and either
calls one tool or answers without tools (general chat).

Failure modes handled (dry-run validated against Groq):
- llama-3.1-8b often emits XML-like <function=name>{...} → tool_use_failed 400
- We default to llama-3.3-70b-versatile and parse failed_generation as fallback
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, List, Optional

import httpx

from app.core.config import settings
from app.core.tool_catalog import (
    ROUTER_SYSTEM_PROMPT,
    enabled_tool_names,
    get_tool_spec,
    intent_for_tool,
    openai_tools_for_enabled,
)
from app.core.tool_schemas import Intent, RouteDecision

logger = logging.getLogger(__name__)

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# Groq sometimes emits XML-like tool calls instead of OpenAI tool_calls → 400 tool_use_failed.
# Shapes seen in production (70B and 8B):
#   <function=weather>{"city": "Pune"}
#   <function=wikipedia{"topic": "Bharatiya Janata Party"}</function>  # missing '>' after name
#   function=news_rss{"topic": "AI"}
_FAILED_FN_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"<function\s*=\s*([a-zA-Z0-9_]+)>\s*(\{.*?\})\s*(?:</function>)?",
        re.DOTALL | re.IGNORECASE,
    ),
    re.compile(
        r"<function\s*=\s*([a-zA-Z0-9_]+)(\{.*?\})\s*(?:</function>)?",
        re.DOTALL | re.IGNORECASE,
    ),
    re.compile(
        r"function\s*=\s*([a-zA-Z0-9_]+)\s*(\{.*?\})",
        re.DOTALL | re.IGNORECASE,
    ),
)
_FAILED_GENERATION_JSON_RE = re.compile(
    r'"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"',
    re.DOTALL,
)


def _general_chat(confidence: float = 1.0) -> RouteDecision:
    return RouteDecision(
        intent=Intent.GENERAL_CHAT,
        needs_tool=False,
        confidence=confidence,
    )


def _parse_tool_args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _extract_json_object(text: str, start: int) -> str | None:
    """Return the first balanced {...} JSON object starting at/after start."""
    brace = text.find("{", start)
    if brace < 0:
        return None
    depth = 0
    in_str = False
    escape = False
    for i in range(brace, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[brace : i + 1]
    return None


def _parse_failed_generation(failed: str) -> tuple[str, dict[str, Any]] | None:
    """Recover tool name + args from Groq tool_use_failed payload."""
    text = (failed or "").strip()
    if not text:
        return None

    # Raw body slices may still contain JSON unicode escapes.
    if "\\u003c" in text or "\\u003e" in text:
        try:
            text = json.loads(f'"{text}"')
        except json.JSONDecodeError:
            text = (
                text.replace("\\u003c", "<")
                .replace("\\u003e", ">")
                .replace('\\"', '"')
            )

    for pattern in _FAILED_FN_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        name = m.group(1).strip()
        args = _parse_tool_args(m.group(2))
        if name and args:
            return name, args
        if name:
            blob = _extract_json_object(text, m.start())
            args = _parse_tool_args(blob or "")
            return name, args

    m_name = re.search(r"function\s*=\s*([a-zA-Z0-9_]+)", text, re.IGNORECASE)
    if m_name:
        name = m_name.group(1).strip()
        blob = _extract_json_object(text, m_name.end())
        if name and blob:
            return name, _parse_tool_args(blob)
    return None


def _failed_generation_from_error_body(body_text: str, err: dict[str, Any]) -> str:
    """Prefer JSON error field; fall back to raw-body regex (truncated/odd payloads)."""
    failed = str(err.get("failed_generation") or "").strip()
    if failed:
        return failed
    m = _FAILED_GENERATION_JSON_RE.search(body_text or "")
    if not m:
        return ""
    raw = m.group(1)
    try:
        return json.loads(f'"{raw}"')
    except json.JSONDecodeError:
        return raw.encode("utf-8").decode("unicode_escape", errors="replace")


def _normalize_weather_city(city: str) -> str:
    """
    Prefer a geocodable place name.
    'Ghansoli, Navi Mumbai' often fails Open-Meteo; try primary locality first.
    """
    cleaned = " ".join(city.split()).strip(" ,")
    if not cleaned:
        return ""
    if "," in cleaned:
        primary = cleaned.split(",", 1)[0].strip()
        if primary:
            return primary
    return cleaned


def _decision_from_tool_call(name: str, args: dict[str, Any]) -> RouteDecision:
    enabled = enabled_tool_names()
    if name not in enabled:
        logger.warning("llm_router_unknown_or_disabled_tool tool=%s", name)
        return _general_chat(confidence=0.0)

    spec = get_tool_spec(name)
    intent = intent_for_tool(name)
    tool_args = dict(args)

    if name == "weather":
        city = _normalize_weather_city(str(tool_args.get("city") or ""))
        if not city:
            return RouteDecision(
                intent=Intent.LIVE_WEATHER,
                needs_tool=False,
                tool_name="weather",
                tool_args={},
                confidence=0.95,
                clarify="Which city should I check the weather for?",
            )
        tool_args["city"] = city

    if name == "news_rss":
        topic = str(tool_args.get("topic") or tool_args.get("query") or "").strip()
        if topic:
            tool_args["topic"] = topic
            tool_args["query"] = topic

    if name == "wikipedia":
        topic = str(tool_args.get("topic") or tool_args.get("query") or "").strip()
        if not topic:
            return _general_chat(confidence=0.4)
        tool_args["topic"] = topic

    if name == "web_search":
        query = str(tool_args.get("query") or "").strip()
        if not query:
            return _general_chat(confidence=0.4)
        tool_args["query"] = query

    if name == "web_fetch":
        url = str(tool_args.get("url") or "").strip()
        if not url:
            return _general_chat(confidence=0.4)
        tool_args["url"] = url

    return RouteDecision(
        intent=intent if spec else Intent.GENERAL_CHAT,
        needs_tool=True,
        tool_name=name,
        tool_args=tool_args,
        confidence=0.92,
    )


def _history_snippet(history: Optional[List[dict]], *, max_turns: int = 4) -> list[dict[str, str]]:
    if not history:
        return []
    useful = [
        m
        for m in history
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant")
        and str(m.get("content") or "").strip()
        and not str(m.get("content") or "").startswith("TOOL_RESULT")
        and not str(m.get("content") or "").startswith("USER_FACTS")
        and not str(m.get("content") or "").startswith("The user's request needs clarification")
    ]
    tail = useful[-max_turns:]
    out: list[dict[str, str]] = []
    for m in tail:
        content = str(m["content"]).strip()
        if len(content) > 400:
            content = content[:400] + "…"
        out.append({"role": str(m["role"]), "content": content})
    return out


async def route_with_llm(
    user_message: str,
    history: Optional[List[dict]] = None,
    *,
    routing_text: Optional[str] = None,
) -> RouteDecision:
    """
    Ask Groq (tool_choice=auto) which single tool to call, if any.
    Fail-open to general_chat only when recovery is impossible.
    """
    text = (routing_text or user_message or "").strip()
    if not text:
        return _general_chat()

    if not settings.GROQ_API_KEY:
        logger.warning("llm_router_skipped reason=missing_groq_api_key")
        return _general_chat(confidence=0.0)

    tools = openai_tools_for_enabled()
    if not tools:
        return _general_chat()

    messages: list[dict[str, str]] = [
        {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
        *_history_snippet(history),
        {"role": "user", "content": text},
    ]

    # 70B is reliable for tool_calls; 8B often returns invalid XML-like calls.
    model = (settings.TOOL_ROUTER_MODEL or settings.GROQ_MODEL or "llama-3.3-70b-versatile").strip()
    timeout = httpx.Timeout(float(settings.TOOL_ROUTER_TIMEOUT_SECONDS))
    payload = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "temperature": 0.0,
        "max_tokens": 256,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                GROQ_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if response.status_code >= 400:
                body_text = response.text or ""
                logger.warning(
                    "llm_router_http_failed status=%s body=%s",
                    response.status_code,
                    body_text[:800],
                )
                # Recover from Groq tool_use_failed + failed_generation.
                try:
                    err_payload = response.json() if body_text else {}
                    err = (err_payload.get("error") or {}) if isinstance(err_payload, dict) else {}
                    if not isinstance(err, dict):
                        err = {}
                    failed = _failed_generation_from_error_body(body_text, err)
                    recovered = _parse_failed_generation(failed)
                    if recovered:
                        name, args = recovered
                        logger.warning(
                            "llm_router_recovered_failed_generation tool=%s args=%s",
                            name,
                            args,
                        )
                        return _decision_from_tool_call(name, args)
                    logger.warning(
                        "llm_router_recovery_failed failed_generation=%r",
                        failed[:240],
                    )
                except Exception as exc:
                    logger.warning("llm_router_recovery_exception err=%s", exc)
                return _general_chat(confidence=0.0)

            body = response.json()
    except Exception as exc:
        logger.warning("llm_router_http_failed error=%s", exc)
        return _general_chat(confidence=0.0)

    choices = body.get("choices") or []
    if not choices:
        return _general_chat(confidence=0.0)

    message = (choices[0] or {}).get("message") or {}
    tool_calls = message.get("tool_calls") or []

    if not tool_calls:
        logger.info("llm_router_no_tool user=%r", text[:80])
        return _general_chat(confidence=0.95)

    call = tool_calls[0] if isinstance(tool_calls[0], dict) else {}
    fn = call.get("function") or {}
    name = str(fn.get("name") or "").strip()
    args = _parse_tool_args(fn.get("arguments"))

    decision = _decision_from_tool_call(name, args)
    logger.info(
        "llm_router_decision tool=%s needs_tool=%s clarify=%s intent=%s args=%s",
        decision.tool_name,
        decision.needs_tool,
        bool(decision.clarify),
        decision.intent.value,
        decision.tool_args,
    )
    return decision
