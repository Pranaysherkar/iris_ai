"""Tool catalog: O(1) name→spec lookup and OpenAI/Groq tool schemas for the LLM router.

Descriptions are judgmental so the model can distinguish live vs static vs personal data.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from app.core.tool_schemas import Intent
from app.core.tool_registry import is_tool_enabled


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    intent: Intent
    description: str
    parameters: dict[str, Any]
    """JSON Schema object for tool arguments."""


# Hash map: O(1) lookup by tool name (production registry).
_TOOL_CATALOG: dict[str, ToolSpec] = {
    "datetime": ToolSpec(
        name="datetime",
        intent=Intent.DATETIME,
        description=(
            "Get the current date and time from the server clock. "
            "Use when the user asks what time/date/day it is now, or needs a timezone-aware clock. "
            "Do NOT use for historical dates or scheduling advice."
        ),
        parameters={
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": "IANA timezone like Asia/Kolkata or America/New_York. Omit for UTC.",
                }
            },
            "additionalProperties": False,
        },
    ),
    "weather": ToolSpec(
        name="weather",
        intent=Intent.LIVE_WEATHER,
        description=(
            "Get LIVE current weather for a specific city (temperature, conditions, wind, humidity). "
            "Use for questions about weather, temperature, rain, forecast right now in a place. "
            "Requires a city name. If the user did not name a city, do not guess — omit the call "
            "or pass an empty city so the app can ask for clarification."
        ),
        parameters={
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, e.g. Pune, Mumbai, London.",
                }
            },
            "required": ["city"],
            "additionalProperties": False,
        },
    ),
    "news_rss": ToolSpec(
        name="news_rss",
        intent=Intent.CURRENT_NEWS,
        description=(
            "Fetch LIVE/recent news headlines from configured RSS feeds (BBC, NYT, etc.). "
            "Use for today's headlines, breaking news, 'what's happening in the world', "
            "or world/home-page style news. "
            "Do NOT use for industry/tech trends, market research, or 'summarize latest AI trends' "
            "(use web_search for those). "
            "Do NOT use for timeless encyclopedia facts (use wikipedia instead)."
        ),
        parameters={
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Optional keyword filter, e.g. AI, cricket, India. Empty = top headlines.",
                },
                "query": {
                    "type": "string",
                    "description": "Alias for topic if you prefer a search-style query.",
                },
            },
            "additionalProperties": False,
        },
    ),
    "wikipedia": ToolSpec(
        name="wikipedia",
        intent=Intent.ENCYCLOPEDIA,
        description=(
            "Look up a STATIC encyclopedia summary on Wikipedia. "
            "Use for 'what is X', history, biographies, definitions, and general knowledge "
            "that does not require real-time data. "
            "Do NOT use for live news, weather, prices, or 'latest/recent' current events."
        ),
        parameters={
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Entity or topic to look up, e.g. debouncing, Goa, Alan Turing.",
                }
            },
            "required": ["topic"],
            "additionalProperties": False,
        },
    ),
    "exchange_rates": ToolSpec(
        name="exchange_rates",
        intent=Intent.EXCHANGE_RATES,
        description=(
            "Get LIVE foreign-exchange rates (currency conversion) via Frankfurter. "
            "Use when converting amounts between currencies (USD, INR, EUR, etc.). "
            "Not for stocks, crypto, or gold."
        ),
        parameters={
            "type": "object",
            "properties": {
                "from_currency": {
                    "type": "string",
                    "description": "ISO 4217 base currency, e.g. USD",
                },
                "to_currency": {
                    "type": "string",
                    "description": "ISO 4217 quote currency, e.g. INR",
                },
                "amount": {
                    "type": "number",
                    "description": "Optional amount to convert. Default 1.",
                },
                "text_hint": {
                    "type": "string",
                    "description": "Original user phrase if currencies are embedded in text.",
                },
            },
            "additionalProperties": False,
        },
    ),
    "user_memory": ToolSpec(
        name="user_memory",
        intent=Intent.USER_DATA,
        description=(
            "Read THIS authenticated user's profile, saved facts, and recent conversations. "
            "Use when they ask about their name, profile, or past chats with Iris. "
            "Do not use for general knowledge."
        ),
        parameters={
            "type": "object",
            "properties": {
                "include_profile": {
                    "type": "boolean",
                    "description": "Include profile fields. Default true.",
                }
            },
            "additionalProperties": False,
        },
    ),
    "web_search": ToolSpec(
        name="web_search",
        intent=Intent.WEB_FACTS,
        description=(
            "Search the live web for current facts, industry/tech trends, research summaries, "
            "and questions like 'latest AI trends', 'summarize current developments in X', "
            "or any live topic not covered by weather, news_rss headlines, wikipedia, or FX. "
            "Prefer this over news_rss when the user asks for trends, analysis, or topic research."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query string.",
                }
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    ),
    "web_fetch": ToolSpec(
        name="web_fetch",
        intent=Intent.WEB_FACTS,
        description=(
            "Fetch and extract content from a single HTTP(S) URL the user provided. "
            "Use only when a specific URL must be read."
        ),
        parameters={
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Full https URL to fetch.",
                }
            },
            "required": ["url"],
            "additionalProperties": False,
        },
    ),
}


def get_tool_spec(name: str) -> Optional[ToolSpec]:
    return _TOOL_CATALOG.get(name)


def enabled_tool_names() -> frozenset[str]:
    """Set of enabled tool names — O(n) build, O(1) membership."""
    return frozenset(name for name in _TOOL_CATALOG if is_tool_enabled(name))


def openai_tools_for_enabled() -> list[dict[str, Any]]:
    """OpenAI/Groq `tools` payload for only enabled tools."""
    tools: list[dict[str, Any]] = []
    for name, spec in _TOOL_CATALOG.items():
        if not is_tool_enabled(name):
            continue
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.parameters,
                },
            }
        )
    return tools


def intent_for_tool(tool_name: str) -> Intent:
    spec = _TOOL_CATALOG.get(tool_name)
    return spec.intent if spec else Intent.GENERAL_CHAT


ROUTER_SYSTEM_PROMPT = """You are Iris AI's tool router. Decide whether the user needs LIVE or EXTERNAL data.

Rules:
1. If the question can be answered from general knowledge alone (coding help, explanations, opinions, creative writing), do NOT call any tool.
2. If the user needs live/current/external data, call EXACTLY ONE tool that best matches.
3. Choose tools by description carefully:
   - today's headlines / breaking news / "what's happening in the world" → news_rss
   - industry/tech trends, "latest AI trends", summarize current developments, market/research topics → web_search (NOT news_rss)
   - weather/temperature in a city → weather (city required)
   - currency conversion → exchange_rates
   - current clock/date → datetime
   - encyclopedia / "what is" static facts → wikipedia
   - user's own name/profile/past chats → user_memory
   - other live web facts → web_search (when enabled)
4. Fill arguments correctly. Never invent cities or URLs.
5. If weather is needed but no city was given, call weather with city as an empty string.
6. For weather, pass a single clear place name (e.g. "Ghansoli" or "Navi Mumbai"), not a long address.
7. Use the API tool_calls format only — never emit XML like <function=name>{{...}}</function>.
"""
