"""Maps tool names to handlers and feature flags."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

from app.core.config import settings
from app.core.tool_schemas import Intent
from app.tools import (
    datetime_tool,
    exchange_rates,
    news_rss,
    user_memory,
    weather,
    web_fetch,
    web_search,
    wikipedia,
)

ToolRunner = Callable[[dict[str, Any]], Awaitable[Any]]


def is_tool_enabled(tool_name: str) -> bool:
    flags: dict[str, bool] = {
        datetime_tool.TOOL_NAME: settings.TOOL_DATETIME_ENABLED,
        weather.TOOL_NAME: settings.TOOL_WEATHER_ENABLED,
        web_search.TOOL_NAME: settings.TOOL_WEB_SEARCH_ENABLED,
        web_fetch.TOOL_NAME: settings.TOOL_WEB_FETCH_ENABLED,
        wikipedia.TOOL_NAME: settings.TOOL_WIKIPEDIA_ENABLED,
        news_rss.TOOL_NAME: settings.TOOL_NEWS_RSS_ENABLED,
        exchange_rates.TOOL_NAME: settings.TOOL_EXCHANGE_RATES_ENABLED,
        user_memory.TOOL_NAME: settings.TOOL_USER_MEMORY_ENABLED,
    }
    return flags.get(tool_name, False)


def get_handler(tool_name: str) -> Optional[ToolRunner]:
    registry: dict[str, ToolRunner] = {
        datetime_tool.TOOL_NAME: datetime_tool.run,
        weather.TOOL_NAME: weather.run,
        web_search.TOOL_NAME: web_search.run,
        web_fetch.TOOL_NAME: web_fetch.run,
        wikipedia.TOOL_NAME: wikipedia.run,
        news_rss.TOOL_NAME: news_rss.run,
        exchange_rates.TOOL_NAME: exchange_rates.run,
        user_memory.TOOL_NAME: user_memory.run,
    }
    if not is_tool_enabled(tool_name):
        return None
    return registry.get(tool_name)


def tool_name_for_intent(intent: Intent) -> Optional[str]:
    if intent == Intent.CURRENT_NEWS:
        if settings.TOOL_NEWS_RSS_ENABLED:
            return news_rss.TOOL_NAME
        return web_search.TOOL_NAME

    mapping: dict[Intent, str] = {
        Intent.DATETIME: datetime_tool.TOOL_NAME,
        Intent.LIVE_WEATHER: weather.TOOL_NAME,
        Intent.WEB_FACTS: web_search.TOOL_NAME,
        Intent.ENCYCLOPEDIA: wikipedia.TOOL_NAME,
        Intent.EXCHANGE_RATES: exchange_rates.TOOL_NAME,
        Intent.USER_DATA: user_memory.TOOL_NAME,
    }
    return mapping.get(intent)
