"""Server clock tool — no external API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result

TOOL_NAME = "datetime"
SOURCE = "server_clock"


async def run(args: dict[str, Any]) -> ToolResult:
    tz_name = args.get("timezone")
    try:
        if tz_name:
            tz = ZoneInfo(str(tz_name))
            now = datetime.now(tz)
        else:
            now = datetime.now(timezone.utc)
    except (ZoneInfoNotFoundError, ValueError):
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Unknown timezone: {tz_name!r}",
        )

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "iso": now.isoformat(),
            "date": now.date().isoformat(),
            "time": now.strftime("%H:%M:%S"),
            "timezone": str(now.tzinfo) if now.tzinfo else "UTC",
            "weekday": now.strftime("%A"),
        },
    )
