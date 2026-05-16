"""Normalize and rewrite user queries before intent routing."""

from __future__ import annotations

import re
from typing import List, Optional

from app.core.config import settings
from app.core.history_context import (
    PENDING_TOOL_METADATA_KEY,
    build_weather_routing_text,
    detect_weather_city_followup,
)
from app.core.preprocessed_query import PreprocessedQuery
from app.core.spell_map import apply_spell_map

_GREETING_ONLY_RE = re.compile(
    r"^(?:hi|hey|hello|yo|sup|thanks|thank you|ok|okay|bye)[\s!.?]*$",
    re.I,
)


def preprocess_query(
    user_message: str,
    history: Optional[List[dict]] = None,
    *,
    pending_tool: Optional[dict] = None,
) -> PreprocessedQuery:
    """
    Fast path: spell map (O(tokens)) + optional follow-up merge (O(k) history scan).
    Skips work for trivial greetings.
    """
    original = (user_message or "").strip()
    if not original:
        return PreprocessedQuery(
            original="",
            corrected="",
            routing_text="",
        )

    if not settings.QUERY_PREPROCESSOR_ENABLED or _GREETING_ONLY_RE.match(original):
        return PreprocessedQuery(
            original=original,
            corrected=original,
            routing_text=original,
        )

    corrected = apply_spell_map(original)
    routing = corrected
    follow_city: Optional[str] = None

    hist = history or []

    # Metadata pending_tool beats heuristics when set (explicit state machine).
    pending = pending_tool or {}
    if pending.get("intent") == "live_weather" and pending.get("tool") == "weather":
        if detect_weather_city_followup(corrected, hist) or _looks_like_short_place(corrected):
            follow_city = corrected.strip()
            routing = build_weather_routing_text(follow_city)
    elif city := detect_weather_city_followup(corrected, hist):
        follow_city = city
        routing = build_weather_routing_text(city)

    return PreprocessedQuery(
        original=original,
        corrected=corrected,
        routing_text=routing,
        follow_up_weather_city=follow_city,
    )


def _looks_like_short_place(text: str) -> bool:
    from app.core.history_context import looks_like_place_name

    return looks_like_place_name(text)


def pending_tool_from_metadata(metadata: Optional[dict]) -> Optional[dict]:
    if not metadata:
        return None
    pending = metadata.get(PENDING_TOOL_METADATA_KEY)
    return pending if isinstance(pending, dict) else None
