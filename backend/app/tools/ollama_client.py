"""HTTP client for Ollama cloud web_search / web_fetch APIs."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class OllamaApiError(Exception):
    """Raised when Ollama returns a non-success response."""


def _api_key() -> str:
    key = (settings.OLLAMA_API_KEY or "").strip()
    if not key:
        raise OllamaApiError(
            "OLLAMA_API_KEY is not set. Add it to .env for web search and fetch."
        )
    return key


def _base_url() -> str:
    return settings.OLLAMA_WEB_SEARCH_BASE_URL.rstrip("/")


async def post_json(path: str, body: dict[str, Any]) -> dict[str, Any]:
    url = f"{_base_url()}{path}"
    timeout = httpx.Timeout(settings.TOOL_HTTP_TIMEOUT_SECONDS)
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=body)
        if response.status_code == 429:
            raise OllamaApiError("Ollama rate limit reached. Try again later.")
        if response.status_code >= 400:
            detail = response.text[:240] if response.text else response.reason_phrase
            raise OllamaApiError(f"Ollama API error ({response.status_code}): {detail}")
        data = response.json()
        if not isinstance(data, dict):
            raise OllamaApiError("Invalid JSON response from Ollama")
        return data
