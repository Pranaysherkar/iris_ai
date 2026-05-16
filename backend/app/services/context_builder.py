"""Merge tool output and memory blocks into the LLM message list."""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from app.core.prompts import get_tool_grounding_prompt
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


def build_tool_context_message(
    result: ToolResult,
    *,
    user_requested_place: Optional[str] = None,
) -> dict[str, str]:
    payload = {
        "tool": result.tool_name,
        "source": result.source,
        "fetched_at": result.fetched_at,
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
            "Do NOT say you lack real-time access or cannot fetch live data."
            f"{place_hint}"
            "Mention the fetch time when relevant. Do not invent missing fields."
        )
    else:
        instruction = (
            "The tool call FAILED. Do not invent live data. "
            "Tell the user you could not fetch the information and quote the error if helpful."
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


def inject_memory_context(
    messages: List[dict],
    *,
    user_facts: Optional[Dict[str, str]] = None,
    conversation_summary: Optional[str] = None,
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

    if not extra:
        return messages

    head = messages[:1]
    tail = messages[1:]
    return [*head, *extra, *tail]


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
