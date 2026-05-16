"""Tool handler protocol and shared helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Awaitable, Protocol

from app.core.tool_schemas import ToolResult


class ToolHandler(Protocol):
    def __call__(self, args: dict[str, Any]) -> Awaitable[ToolResult]: ...


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def success_result(
    *,
    tool_name: str,
    source: str,
    data: dict[str, Any],
) -> ToolResult:
    return ToolResult(
        success=True,
        tool_name=tool_name,
        source=source,
        fetched_at=utc_now_iso(),
        data=data,
    )


def failure_result(
    *,
    tool_name: str,
    source: str,
    error: str,
) -> ToolResult:
    return ToolResult(
        success=False,
        tool_name=tool_name,
        source=source,
        fetched_at=utc_now_iso(),
        data={},
        error=error,
    )
