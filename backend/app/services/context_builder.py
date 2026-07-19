"""Merge tool output and memory blocks into the LLM message list."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.core.config import settings
from app.core.greeting import is_likely_greeting_only_user_message
from app.core.prompts import get_document_grounding_prompt, get_tool_grounding_prompt
from app.core.tool_schemas import RouteDecision, ToolResult

# Strip leaked internal labels if the model still cites them.
_LEAKED_SOURCE_PREFIX = re.compile(
    r"^\s*(?:"
    r"(?:according\s+to|based\s+on|from|per)\s+"
    r"(?:the\s+)?"
    r"(?:tool[_\s-]?result|live[_\s-]?context|tool\s+result|live\s+data|json(?:\s+below)?|system(?:\s+message)?)"
    r"(?:\s+you\s+provided(?:\s+earlier)?)?"
    r"[,:]?\s*"
    r")+",
    re.IGNORECASE,
)
_LEAKED_LABEL = re.compile(
    r"\b(?:TOOL_RESULT|LIVE_CONTEXT)\b",
    re.IGNORECASE,
)


def sanitize_user_facing_assistant_text(text: str) -> str:
    """Remove internal tool/system labels from assistant text shown to users."""
    if not text:
        return text
    cleaned = text
    # Repeat: model may stack “According to the TOOL_RESULT, based on…”
    for _ in range(3):
        nxt = _LEAKED_SOURCE_PREFIX.sub("", cleaned, count=1)
        if nxt == cleaned:
            break
        cleaned = nxt
    cleaned = _LEAKED_LABEL.sub("", cleaned)
    # Fix awkward leftovers like ", the introduction" after strip → capitalize first letter.
    cleaned = cleaned.lstrip(" ,:-")
    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned


def build_clarification_message(decision: RouteDecision) -> dict[str, str]:
    return {
        "role": "system",
        "content": (
            "The user's request needs clarification before using live data. "
            "Reply with ONLY a short question to get the missing detail. "
            "Do not say you lack internet or real-time data — ask for the city or detail needed. "
            f"Ask: {decision.clarify}"
        ),
    }


def _human_fetch_time(iso_ts: str) -> str:
    """Turn ISO UTC into a short display string; fall back to the raw value."""
    text = (iso_ts or "").strip()
    if not text:
        return ""
    try:
        # Support trailing Z and offset forms from utc_now_iso().
        normalized = text.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
    except ValueError:
        return text


def _compact_tool_data(result: ToolResult) -> dict:
    """Shrink tool payloads for the LLM so Groq TPM stays under free-tier limits."""
    data = result.data if isinstance(result.data, dict) else {}
    name = result.tool_name

    if name == "web_search":
        rows = data.get("results") or []
        compact_rows = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            compact_rows.append(
                {
                    "title": str(row.get("title") or "").strip(),
                    "url": str(row.get("url") or "").strip(),
                    "snippet": str(row.get("content") or row.get("snippet") or "").strip(),
                }
            )
        return {
            "query": data.get("query"),
            "result_count": len(compact_rows),
            "results": compact_rows,
        }

    if name == "news_rss":
        max_h = max(1, int(settings.TOOL_NEWS_RSS_MAX_HEADLINES))
        desc_chars = max(40, int(settings.TOOL_NEWS_RSS_DESC_CHARS))
        compact: list[dict[str, str]] = []
        for row in (data.get("headlines") or [])[:max_h]:
            if not isinstance(row, dict):
                continue
            desc = str(row.get("description") or "").strip()
            if len(desc) > desc_chars:
                desc = desc[:desc_chars].rstrip() + "…"
            compact.append(
                {
                    "title": str(row.get("title") or "").strip(),
                    "url": str(row.get("url") or "").strip(),
                    "description": desc,
                }
            )
        return {
            "topic_filter": data.get("topic_filter"),
            "headline_count": len(compact),
            "headlines": compact,
        }

    if name == "web_fetch":
        max_chars = max(500, int(settings.TOOL_WEB_FETCH_MAX_CHARS))
        content = str(data.get("content") or "")
        return {
            "url": data.get("url"),
            "title": data.get("title"),
            "content": content[:max_chars],
            "content_truncated": bool(data.get("content_truncated")) or len(content) > max_chars,
        }

    if name == "wikipedia":
        max_chars = max(400, int(settings.TOOL_WIKIPEDIA_SUMMARY_CHARS))
        summary = str(data.get("summary") or "")
        return {
            "topic_query": data.get("topic_query"),
            "title": data.get("title"),
            "url": data.get("url"),
            "summary": summary[:max_chars],
            "summary_truncated": bool(data.get("summary_truncated")) or len(summary) > max_chars,
        }

    return data


def build_tool_context_message(
    result: ToolResult,
    *,
    user_requested_place: Optional[str] = None,
) -> dict[str, str]:
    payload = {
        "tool": result.tool_name,
        "source": result.source,
        "fetched_at": result.fetched_at,
        "fetched_at_display": _human_fetch_time(result.fetched_at),
        "success": result.success,
        "data": _compact_tool_data(result),
        "error": result.error,
    }
    if user_requested_place:
        payload["user_requested_place"] = user_requested_place.strip()
    body = json.dumps(payload, ensure_ascii=False)
    if result.success:
        place_hint = ""
        if user_requested_place:
            place_hint = (
                f" The user asked about {user_requested_place.strip()!r}. "
                "Report weather for data.location / data.city_query that matches that place. "
            )
        web_search_hint = ""
        if result.tool_name == "web_search":
            web_search_hint = (
                " For web_search: list options/providers/facts ONLY from data.results. "
                "Do not invent vendors, products, prices, or stats not supported by those snippets. "
                "Prefer variety across the listed sources. "
                "Cite title and URL for key claims (short markdown links are fine)."
            )
        instruction = (
            "Use ONLY the JSON below for live factual claims. "
            "Do NOT say you lack real-time access, internet, or cannot fetch live data — "
            "the JSON below is live data. Answer the user's question directly from data. "
            "Never mention tools, tool names, APIs, backends, JSON, or this system message. "
            "Do not cite your source — answer naturally as Iris (no “According to…” openers). "
            f"{place_hint}"
            f"{web_search_hint}"
            "Do not invent missing fields. "
            "Do NOT paste raw ISO timestamps (e.g. 2026-07-10T16:06:56+00:00). "
            "For news headlines, omit fetch time unless the user asks when data was updated; "
            "end with a brief offer to go deeper on a story. "
            "For weather or other live facts, if you mention time use fetched_at_display only "
            "(natural phrasing is fine)."
        )
    else:
        instruction = (
            "Live lookup FAILED. Do not invent live data. "
            "Reply in a professional, helpful tone — never say a tool or API failed, "
            "never quote raw error strings, JSON, or internal messages. "
            "Explain briefly in plain language what you could not get. "
            "For news with a city/region filter and no results: say local/city feeds are not "
            "available yet, then offer today’s world headlines or another topic. "
            "Offer one clear next step (broader query, different topic, or world news)."
        )
    # No ALL_CAPS label — models often cite headers like "TOOL_RESULT" to the user.
    return {
        "role": "system",
        "content": f"{instruction}\n{body}",
    }


def build_user_facts_message(facts: Dict[str, str]) -> Optional[dict[str, str]]:
    if not facts:
        return None
    lines = [f"- {key}: {value}" for key, value in facts.items()]
    return {
        "role": "system",
        "content": (
            "USER_FACTS (explicitly stated by this user; treat as true for personalization):\n"
            + "\n".join(lines)
        ),
    }


def build_conversation_summary_message(summary: Optional[str]) -> Optional[dict[str, str]]:
    text = (summary or "").strip()
    if not text:
        return None
    return {
        "role": "system",
        "content": (
            "CONVERSATION_SUMMARY (earlier context from this thread; use for recall):\n"
            f"{text}"
        ),
    }


def build_substantive_request_message(user_message: str) -> Optional[dict[str, str]]:
    """Block greeting-only replies when the user also asked for something real."""
    text = (user_message or "").strip()
    if not text or is_likely_greeting_only_user_message(text):
        return None
    return {
        "role": "system",
        "content": (
            "REQUEST_PRIORITY: The latest user message is NOT greeting-only — it includes a real ask. "
            "Do not reply with only a greeting like “Hi! What can I help you with?”. "
            "Answer the user's request directly (use live data from system context when present). "
            "Never mention tools, APIs, or internal system labels to the user."
        ),
    }


def inject_memory_context(
    messages: List[dict],
    *,
    user_facts: Optional[Dict[str, str]] = None,
    conversation_summary: Optional[str] = None,
    user_message: Optional[str] = None,
) -> List[dict]:
    """Insert memory system messages after the persona prompt (index 0)."""
    if not messages:
        return messages

    extra: List[dict] = []
    facts_msg = build_user_facts_message(user_facts or {})
    if facts_msg:
        extra.append(facts_msg)
    summary_msg = build_conversation_summary_message(conversation_summary)
    if summary_msg:
        extra.append(summary_msg)
    priority_msg = build_substantive_request_message(user_message or "")
    if priority_msg:
        extra.append(priority_msg)

    if not extra:
        return messages

    head = messages[:1]
    tail = messages[1:]
    return [*head, *extra, *tail]


def build_document_context_message(context_body: str) -> Optional[dict[str, str]]:
    text = (context_body or "").strip()
    if not text:
        return None
    return {
        "role": "system",
        "content": (
            "DOCUMENT_CONTEXT\n"
            "Use ONLY the excerpts below for claims about the user's documents. "
            "If something is missing, say so clearly.\n"
            f"{text}"
        ),
    }


def inject_document_context(
    messages: List[dict],
    *,
    context_body: Optional[str] = None,
) -> List[dict]:
    """Insert DOCUMENT_CONTEXT after the persona system prompt when RAG retrieved hits."""
    if not messages:
        return messages
    doc_msg = build_document_context_message(context_body or "")
    if not doc_msg:
        return messages
    grounding = {"role": "system", "content": get_document_grounding_prompt()}
    head = messages[:1]
    tail = messages[1:]
    return [*head, grounding, doc_msg, *tail]


def inject_tool_context(
    messages: List[dict],
    *,
    tool_result: Optional[ToolResult] = None,
    clarification: Optional[RouteDecision] = None,
    user_requested_place: Optional[str] = None,
) -> List[dict]:
    """Insert grounding system lines after the main persona system prompt (index 0)."""
    if not messages:
        return messages

    extra: List[dict] = []
    if tool_result:
        extra.append(
            build_tool_context_message(
                tool_result,
                user_requested_place=user_requested_place,
            )
        )
    if clarification and clarification.clarify:
        extra.append(build_clarification_message(clarification))

    if not extra:
        return messages

    grounding = {"role": "system", "content": get_tool_grounding_prompt()}
    head = messages[:1]
    tail = messages[1:]
    return [*head, grounding, *extra, *tail]
