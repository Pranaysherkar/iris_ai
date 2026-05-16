"""Foreign exchange rates via Frankfurter (no API key)."""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result
from app.tools.http_client import fetch_json

TOOL_NAME = "exchange_rates"
SOURCE = "frankfurter"

_CURRENCY_PAIR_RE = re.compile(
    r"\b([A-Z]{3})\s*(?:to|/|in)\s*([A-Z]{3})\b",
    re.I,
)
_AMOUNT_RE = re.compile(r"\b(\d+(?:\.\d+)?)\s*([A-Z]{3})\b", re.I)


def _parse_currencies(text: str, args: dict[str, Any]) -> tuple[str, str] | None:
    base = str(args.get("from_currency") or args.get("from") or "").strip().upper()
    quote = str(args.get("to_currency") or args.get("to") or "").strip().upper()
    if base and quote:
        return base, quote

    m = _CURRENCY_PAIR_RE.search(text)
    if m:
        return m.group(1).upper(), m.group(2).upper()

    m2 = re.search(r"\b([A-Z]{3})\s+([A-Z]{3})\s+rate", text, re.I)
    if m2:
        return m2.group(1).upper(), m2.group(2).upper()

    return None


async def run(args: dict[str, Any]) -> ToolResult:
    hint = str(args.get("text_hint") or "")
    pair = _parse_currencies(hint, args)
    if not pair:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Could not detect currency pair (e.g. USD to INR).",
        )

    base, quote = pair
    url = settings.FRANKFURTER_API_URL.rstrip("/")

    try:
        data = await fetch_json(f"{url}/latest", params={"from": base, "to": quote})
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Exchange rate service unavailable: {exc}",
        )

    rates = data.get("rates") or {}
    rate = rates.get(quote)
    if rate is None:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"No rate returned for {base} → {quote}.",
        )

    amount = args.get("amount")
    if amount is None and hint:
        m = _AMOUNT_RE.search(hint)
        if m:
            amount = float(m.group(1))

    converted = None
    if amount is not None:
        try:
            converted = float(amount) * float(rate)
        except (TypeError, ValueError):
            pass

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "from_currency": base,
            "to_currency": quote,
            "rate": rate,
            "date": data.get("date"),
            "amount": amount,
            "converted_amount": converted,
        },
    )
