"""Shared async HTTP helpers for tools."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from app.core.config import settings


def _default_headers() -> dict[str, str]:
    return {
        "User-Agent": f"{settings.APP_NAME}/1.0 (Iris AI backend tool; +https://github.com)",
    }


async def fetch_json(
    url: str,
    *,
    params: Optional[dict[str, Any]] = None,
    headers: Optional[dict[str, str]] = None,
) -> Any:
    timeout = httpx.Timeout(settings.TOOL_HTTP_TIMEOUT_SECONDS)
    merged = {**_default_headers(), **(headers or {})}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url, params=params, headers=merged)
        response.raise_for_status()
        return response.json()


async def fetch_text(url: str) -> str:
    timeout = httpx.Timeout(settings.TOOL_HTTP_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url, headers=_default_headers())
        response.raise_for_status()
        return response.text
