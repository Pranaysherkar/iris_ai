"""Wikipedia summaries via the MediaWiki API (no API key)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result
from app.tools.http_client import fetch_json

TOOL_NAME = "wikipedia"
SOURCE = "wikipedia_api"


async def run(args: dict[str, Any]) -> ToolResult:
    topic = str(args.get("topic") or args.get("query") or "").strip()
    if not topic:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Missing required argument: topic",
        )

    base = settings.WIKIPEDIA_API_URL.rstrip("/")
    try:
        search_data = await fetch_json(
            base,
            params={
                "action": "query",
                "list": "search",
                "srsearch": topic,
                "format": "json",
                "srlimit": 1,
                "utf8": 1,
            },
        )
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Wikipedia search failed: {exc}",
        )

    hits = (search_data.get("query") or {}).get("search") or []
    if not hits:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"No Wikipedia article found for '{topic}'.",
        )

    title = hits[0].get("title")
    if not title:
        return failure_result(tool_name=TOOL_NAME, source=SOURCE, error="Invalid search result.")

    try:
        summary_data = await fetch_json(
            base,
            params={
                "action": "query",
                "prop": "extracts|info",
                "exintro": 1,
                "explaintext": 1,
                "titles": title,
                "format": "json",
                "inprop": "url",
            },
        )
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Wikipedia summary failed: {exc}",
        )

    pages = (summary_data.get("query") or {}).get("pages") or {}
    page = next(iter(pages.values()), {})
    extract = str(page.get("extract") or "").strip()
    if not extract:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"No summary text for '{title}'.",
        )

    page_url = page.get("fullurl") or f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}"

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "topic_query": topic,
            "title": title,
            "url": page_url,
            "summary": extract[:4_000],
            "summary_truncated": len(extract) > 4_000,
        },
    )
