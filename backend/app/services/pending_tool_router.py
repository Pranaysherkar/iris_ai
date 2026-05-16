"""Force tool routes when conversation state expects a follow-up answer."""

from __future__ import annotations

from typing import Any, Optional

from app.core.history_context import looks_like_place_name
from app.core.preprocessed_query import PreprocessedQuery
from app.core.tool_registry import tool_name_for_intent
from app.core.tool_schemas import Intent, RouteDecision


def forced_route_from_follow_up(
    user_message: str,
    preprocessed: PreprocessedQuery,
    pending_tool: Optional[dict[str, Any]] = None,
) -> Optional[RouteDecision]:
    """
    When the user replies with a place after a weather clarify (or pending_tool is set),
    bypass general_chat and run the weather tool with high confidence.
    """
    city = (preprocessed.follow_up_weather_city or "").strip()
    if not city:
        pending = pending_tool or {}
        if pending.get("intent") == "live_weather" and pending.get("tool") == "weather":
            candidate = (preprocessed.corrected or user_message or "").strip()
            if looks_like_place_name(candidate):
                city = candidate

    if not city:
        return None

    return RouteDecision(
        intent=Intent.LIVE_WEATHER,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.LIVE_WEATHER),
        tool_args={"city": city},
        confidence=0.98,
    )
