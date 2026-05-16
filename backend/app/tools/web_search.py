"""Web search via Ollama cloud API."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result
from app.tools.ollama_client import OllamaApiError, post_json

TOOL_NAME = "web_search"
SOURCE = "ollama_web_search"


def _normalize_results(raw: list[Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("url") or "").strip(),
                "content": str(item.get("content") or "").strip(),
            }
        )
    return out


async def run(args: dict[str, Any]) -> ToolResult:
    query = str(args.get("query") or "").strip()
    if not query:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Missing required argument: query",
        )

    max_results = int(args.get("max_results") or settings.TOOL_WEB_SEARCH_MAX_RESULTS)
    max_results = max(1, min(max_results, 10))

    try:
        data = await post_json(
            "/api/web_search",
            {"query": query, "max_results": max_results},
        )
    except OllamaApiError as exc:
        return failure_result(tool_name=TOOL_NAME, source=SOURCE, error=str(exc))
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Web search request failed: {exc}",
        )

    results = _normalize_results(data.get("results") or [])
    if not results:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"No web results found for: {query}",
        )

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "query": query,
            "result_count": len(results),
            "results": results,
        },
    )
