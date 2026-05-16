"""O(k) scans over recent history for dialogue follow-ups (k = small window)."""

from __future__ import annotations

import re
from typing import List, Optional

# Assistant prompts that expect a city name next.
_CITY_CLARIFY_MARKERS: tuple[str, ...] = (
    "which city",
    "what city",
    "city should i check",
    "check the weather for",
    "can't detect your location",
    "detect your location automatically",
    "for example: mumbai",
)

# Pending tool keys stored in conversation.metadata
PENDING_TOOL_METADATA_KEY = "pending_tool"

_PLACE_REPLY_RE = re.compile(r"^[A-Za-z][A-Za-z\s\-'.]{1,48}$")


def _dialogue_turns(history: List[dict]) -> List[dict]:
    """User/assistant messages only (excludes system memory / tool blocks)."""
    return [
        m
        for m in history
        if str(m.get("role", "")).lower() in ("user", "assistant")
    ]


def _last_assistant_text(history: List[dict], max_scan: int = 6) -> Optional[str]:
    """Walk from newest to oldest — stops at first assistant message."""
    dialogue = _dialogue_turns(history)
    # Current user turn is often already in history; skip it before finding clarify.
    while dialogue and str(dialogue[-1].get("role", "")).lower() == "user":
        dialogue = dialogue[:-1]

    scanned = 0
    for msg in reversed(dialogue):
        if scanned >= max_scan:
            break
        scanned += 1
        if str(msg.get("role", "")).lower() != "assistant":
            continue
        content = str(msg.get("content", "")).strip()
        if content and content != "__thinking__":
            return content
    return None


def assistant_asked_for_city(history: List[dict]) -> bool:
    text = _last_assistant_text(history)
    if not text:
        return False
    lower = text.lower()
    return any(marker in lower for marker in _CITY_CLARIFY_MARKERS)


def looks_like_place_name(text: str) -> bool:
    candidate = text.strip()
    if not candidate or len(candidate) > 50:
        return False
    if len(candidate.split()) > 4:
        return False
    return bool(_PLACE_REPLY_RE.match(candidate))


def detect_weather_city_followup(user_message: str, history: List[dict]) -> Optional[str]:
    """
    If the user replies with only a place after Iris asked for a city, return that place.
    """
    msg = user_message.strip()
    if not msg or not looks_like_place_name(msg):
        return None
    if not assistant_asked_for_city(history):
        return None
    return msg


def build_weather_routing_text(city: str) -> str:
    return f"current temperature and weather in {city.strip()}"
