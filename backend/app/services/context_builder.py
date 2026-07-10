"""Merge tool output and memory blocks into the LLM message list."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.core.greeting import is_likely_greeting_only_user_message
from app.core.prompts import get_document_grounding_prompt, get_tool_grounding_prompt
from app.core.tool_schemas import RouteDecision, ToolResult


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
        "data": result.data,
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
        instruction = (
            "Use ONLY the JSON below for live factual claims. "
            "Do NOT say you lack real-time access, internet, or cannot fetch live data — "
            "this TOOL_RESULT is live data. Answer the user's question directly from data. "
            f"{place_hint}"
            "Do not invent missing fields. "
            "Do NOT paste raw ISO timestamps (e.g. 2026-07-10T16:06:56+00:00). "
            "For news headlines, omit fetch time unless the user asks when data was updated; "
            "end with a brief offer to go deeper on a story. "
            "For weather or other live facts, if you mention time use fetched_at_display only "
            "(natural phrasing is fine)."
        )
    else:
        instruction = (
            "The tool call FAILED. Do not invent live data. "
            "Reply in a professional, helpful tone — never say “tool call failed”, "
            "never quote raw error strings, JSON, or internal messages. "
            "Explain briefly in plain language what you could not get. "
            "For news with a city/region filter and no results: say local/city feeds are not "
            "available yet, then offer today’s world headlines or another topic. "
            "Offer one clear next step (broader query, different topic, or world news)."
        )
    return {
        "role": "system",
        "content": f"TOOL_RESULT\n{instruction}\n{body}",
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
            "Answer the user's request (use TOOL_RESULT when present)."
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
