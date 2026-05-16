"""Fetch a single web page via Ollama cloud API."""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result
from app.tools.ollama_client import OllamaApiError, post_json

TOOL_NAME = "web_fetch"
SOURCE = "ollama_web_fetch"

_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)


def extract_url(text: str) -> str | None:
    m = _URL_RE.search(text or "")
    return m.group(0).rstrip(".,);]") if m else None


async def run(args: dict[str, Any]) -> ToolResult:
    url = str(args.get("url") or "").strip()
    if not url:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Missing required argument: url",
        )

    try:
        data = await post_json("/api/web_fetch", {"url": url})
    except OllamaApiError as exc:
        return failure_result(tool_name=TOOL_NAME, source=SOURCE, error=str(exc))
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Web fetch request failed: {exc}",
        )

    content = str(data.get("content") or "").strip()
    if not content:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Page returned no content: {url}",
        )

    links = data.get("links") or []
    if not isinstance(links, list):
        links = []

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "url": url,
            "title": str(data.get("title") or "").strip(),
            "content": content[:12_000],
            "content_truncated": len(content) > 12_000,
            "links": [str(link) for link in links[:20]],
        },
    )
