"""
Optional input moderation via OpenAI Moderations API (works without using OpenAI for chat).

Set CHAT_MODERATION_ENABLED=true and OPENAI_API_KEY in .env to enable.
On API rate limits or outages, CHAT_MODERATION_FAIL_OPEN (default true) lets chat continue.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)
_warned_missing_key = False
_warned_fail_open = False

# HTTP statuses where skipping moderation is acceptable (transient / quota).
_FAIL_OPEN_STATUS_CODES = frozenset({401, 403, 408, 429, 500, 502, 503, 504})


def _should_fail_open() -> bool:
    return bool(settings.CHAT_MODERATION_FAIL_OPEN)


def _log_fail_open_once(message: str, *args: object) -> None:
    global _warned_fail_open
    if _warned_fail_open:
        logger.warning(message, *args)
    else:
        _warned_fail_open = True
        logger.warning(message + " (Further moderation skips logged at debug.)", *args)


async def moderate_user_input(text: str) -> None:
    """Raises HTTPException 400 if the message is flagged; no-op when disabled."""
    if not settings.CHAT_MODERATION_ENABLED:
        return

    global _warned_missing_key
    api_key: Optional[str] = settings.OPENAI_API_KEY
    if not api_key:
        if not _warned_missing_key:
            logger.warning(
                "CHAT_MODERATION_ENABLED is true but OPENAI_API_KEY is unset; skipping moderation"
            )
            _warned_missing_key = True
        return

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/moderations",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.CHAT_MODERATION_MODEL,
                    "input": text,
                },
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if _should_fail_open() and status in _FAIL_OPEN_STATUS_CODES:
            _log_fail_open_once(
                "Moderation API returned %s; skipping safety check (fail-open). %s",
                status,
                exc,
            )
            return
        logger.exception("Moderation request failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Safety check is temporarily unavailable. Please try again.",
        ) from exc
    except httpx.HTTPError as exc:
        if _should_fail_open():
            _log_fail_open_once(
                "Moderation request failed; skipping safety check (fail-open). %s",
                exc,
            )
            return
        logger.exception("Moderation request failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Safety check is temporarily unavailable. Please try again.",
        ) from exc

    results = data.get("results") or []
    if not results:
        return

    if results[0].get("flagged"):
        raise HTTPException(
            status_code=400,
            detail="This message could not be sent due to safety guidelines.",
        )
