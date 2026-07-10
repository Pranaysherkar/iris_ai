"""Legacy deterministic intent matching (regex). Prefer TOOL_ROUTER_MODE=llm."""

from __future__ import annotations

import re
from typing import List, Optional

from app.core.tool_registry import tool_name_for_intent
from app.core.tool_schemas import Intent, RouteDecision
from app.tools.web_fetch import extract_url

_DATETIME_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(what('s| is)|tell me|give me)\s+(the\s+)?(current\s+)?(date|time)\b", re.I),
    re.compile(r"\bwhat\s+day\s+is\s+(it|today)\b", re.I),
    re.compile(r"\btoday'?s?\s+date\b", re.I),
    re.compile(r"\bcurrent\s+(date|time)\b", re.I),
    re.compile(r"\bwhat\s+time\s+is\s+it\b", re.I),
    re.compile(r"\bdate\s+and\s+time\b", re.I),
)

_WEATHER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(weather|forecast|temperature|temprature|temp|rain|humidity)\b", re.I),
    re.compile(r"\bhow\s+(hot|cold)\s+is\s+it\b", re.I),
)

_VAGUE_LOCATION_PHRASES = frozenset(
    {
        "my area",
        "my location",
        "my city",
        "near me",
        "around me",
        "where i am",
        "where i live",
        "here",
        "local",
    }
)

_NEWS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(?:latest|current|breaking|today'?s?)\b.*\bnews\b", re.I),
    re.compile(r"\bnews\s+(?:today|now|headlines?)\b", re.I),
    re.compile(r"\bheadlines?\b", re.I),
    re.compile(r"\bwhat'?s\s+happening\s+(?:in|with)\b", re.I),
)

_WIKIPEDIA_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwikipedia\b", re.I),
    re.compile(r"\btell me about\b", re.I),
    re.compile(r"\bwho was\b", re.I),
    re.compile(r"\bwhat is the history of\b", re.I),
)

_EXCHANGE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bexchange rate\b", re.I),
    re.compile(r"\bconvert\b.*\bto\b", re.I),
    re.compile(r"\b([A-Z]{3})\s+to\s+([A-Z]{3})\b"),
    re.compile(r"\b([A-Z]{3})\s*/\s*([A-Z]{3})\b"),
)

_USER_MEMORY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bmy profile\b", re.I),
    re.compile(r"\bmy conversations?\b", re.I),
    re.compile(r"\bwhat('s| is)\s+my name\b", re.I),
    re.compile(r"\bdo you know my name\b", re.I),
    re.compile(r"\bmy (full )?name\b", re.I),
)

_WEB_SEARCH_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bsearch\s+(the\s+)?(web|internet)\b", re.I),
    re.compile(r"\blook\s+up\s+online\b", re.I),
    re.compile(r"\bfind\s+(out\s+)?(online|on the web)\b", re.I),
    re.compile(r"\b(latest|recent|current)\s+.*\b(about|on)\b", re.I),
    re.compile(r"\bwho\s+is\s+", re.I),
    re.compile(r"\bwhat\s+happened\s+", re.I),
)

_QUERY_STRIP_RE = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:search(?:\s+the\s+(?:web|internet))? for|look up|find|get me)\s+",
    re.I,
)


def _match_datetime(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _DATETIME_PATTERNS):
        return None
    return RouteDecision(
        intent=Intent.DATETIME,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.DATETIME),
        tool_args={},
        confidence=0.96,
    )


def _is_vague_location(city: str) -> bool:
    normalized = city.strip().lower()
    return normalized in _VAGUE_LOCATION_PHRASES or normalized.startswith("my ")


def _match_weather(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _WEATHER_PATTERNS):
        return None
    city = _extract_city_hint(text)
    if not city or _is_vague_location(city):
        return RouteDecision(
            intent=Intent.LIVE_WEATHER,
            needs_tool=False,
            confidence=0.85,
            clarify=(
                "Which city should I check the weather for? "
                "(For example: Mumbai, Delhi, London.) I can't detect your location automatically yet."
            ),
        )
    return RouteDecision(
        intent=Intent.LIVE_WEATHER,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.LIVE_WEATHER),
        tool_args={"city": city},
        confidence=0.92,
    )


def _match_web_fetch(text: str) -> Optional[RouteDecision]:
    url = extract_url(text)
    if not url:
        return None
    return RouteDecision(
        intent=Intent.WEB_FACTS,
        needs_tool=True,
        tool_name="web_fetch",
        tool_args={"url": url},
        confidence=0.95,
    )


def _extract_wikipedia_topic(text: str) -> str:
    for pattern, group in (
        (r"\btell me about\s+(.+)", 1),
        (r"\bwho was\s+(.+)", 1),
        (r"\bwhat is the history of\s+(.+)", 1),
        (r"\bwikipedia\s+(.+)", 1),
    ):
        m = re.search(pattern, text, re.I)
        if m:
            return m.group(group).strip(" ?.!")
    return _build_search_query(text)


def _match_user_memory(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _USER_MEMORY_PATTERNS):
        return None
    return RouteDecision(
        intent=Intent.USER_DATA,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.USER_DATA),
        tool_args={},
        confidence=0.93,
    )


def _match_exchange(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _EXCHANGE_PATTERNS):
        return None
    return RouteDecision(
        intent=Intent.EXCHANGE_RATES,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.EXCHANGE_RATES),
        tool_args={"text_hint": text},
        confidence=0.91,
    )


def _match_wikipedia(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _WIKIPEDIA_PATTERNS):
        return None
    return RouteDecision(
        intent=Intent.ENCYCLOPEDIA,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.ENCYCLOPEDIA),
        tool_args={"topic": _extract_wikipedia_topic(text)},
        confidence=0.9,
    )


def _match_news(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _NEWS_PATTERNS):
        return None
    query = _build_search_query(text)
    tool = tool_name_for_intent(Intent.CURRENT_NEWS)
    args: dict = {"query": query, "topic": query}
    return RouteDecision(
        intent=Intent.CURRENT_NEWS,
        needs_tool=True,
        tool_name=tool,
        tool_args=args,
        confidence=0.9,
    )


def _match_web_search(text: str) -> Optional[RouteDecision]:
    if not any(p.search(text) for p in _WEB_SEARCH_PATTERNS):
        return None
    return RouteDecision(
        intent=Intent.WEB_FACTS,
        needs_tool=True,
        tool_name=tool_name_for_intent(Intent.WEB_FACTS),
        tool_args={"query": _build_search_query(text)},
        confidence=0.88,
    )


def _build_search_query(text: str) -> str:
    q = _QUERY_STRIP_RE.sub("", text.strip())
    q = q.strip(" ?.!")
    return q or text.strip()


def _extract_city_hint(text: str) -> Optional[str]:
    patterns = (
        r"\b(?:weather|forecast|temperature|temprature|temp|rain|humidity)\s+in\s+([A-Za-z][A-Za-z\s\-]{1,48})",
        r"\b(?:in|at|for)\s+([A-Za-z][A-Za-z\s\-]{1,48}?)(?:\s*\?|$|\s+(?:right\s+)?now)",
        r"\bweather\s+in\s+([A-Za-z][A-Za-z\s\-]{1,48})",
    )
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            city = m.group(1).strip()
            city = re.sub(r"\s+(?:today|now|currently|please)\s*$", "", city, flags=re.I)
            if city and not _is_vague_location(city):
                return city
    return None


def match_intent(user_message: str, history: Optional[List[dict]] = None) -> RouteDecision:
    """Return the best rule-based route, or general chat."""
    text = (user_message or "").strip()
    if not text:
        return RouteDecision(intent=Intent.GENERAL_CHAT, needs_tool=False, confidence=1.0)

    matchers = (
        _match_datetime,
        _match_weather,
        _match_user_memory,
        _match_exchange,
        _match_web_fetch,
        _match_wikipedia,
        _match_news,
        _match_web_search,
    )
    for matcher in matchers:
        decision = matcher(text)
        if decision is not None:
            return decision

    _ = history
    return RouteDecision(intent=Intent.GENERAL_CHAT, needs_tool=False, confidence=1.0)
