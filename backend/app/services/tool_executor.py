"""Validate and run registered tools."""

from __future__ import annotations

import logging

from app.core.config import settings
from app.core.tool_context import ToolRunContext
from app.core.tool_registry import get_handler, is_tool_enabled
from app.core.tool_schemas import RouteDecision, ToolResult
from app.tools.base import failure_result
from app.tools.user_memory import TOOL_NAME as USER_MEMORY_TOOL

logger = logging.getLogger(__name__)


def _build_tool_args(decision: RouteDecision, ctx: ToolRunContext | None) -> dict:
    args = dict(decision.tool_args)
    if decision.tool_name == USER_MEMORY_TOOL:
        if ctx and ctx.user_id:
            args["user_id"] = ctx.user_id
        if ctx and ctx.conversation_id:
            args["conversation_id"] = ctx.conversation_id
    return args


async def execute_route(
    decision: RouteDecision,
    ctx: ToolRunContext | None = None,
) -> ToolResult | None:
    if not settings.TOOLS_ENABLED or not decision.needs_tool:
        return None

    tool_name = decision.tool_name
    if not tool_name:
        return failure_result(
            tool_name="unknown",
            source="tool_executor",
            error="No tool mapped for this intent.",
        )

    if not is_tool_enabled(tool_name):
        return failure_result(
            tool_name=tool_name,
            source="tool_executor",
            error=f"Tool '{tool_name}' is not enabled yet.",
        )

    handler = get_handler(tool_name)
    if handler is None:
        return failure_result(
            tool_name=tool_name,
            source="tool_executor",
            error=f"Tool '{tool_name}' is not implemented.",
        )

    args = _build_tool_args(decision, ctx)
    if decision.tool_name == USER_MEMORY_TOOL and not args.get("user_id"):
        return failure_result(
            tool_name=USER_MEMORY_TOOL,
            source="tool_executor",
            error="User context is required for user_memory.",
        )

    try:
        result = await handler(args)
        if isinstance(result, ToolResult):
            result.intent = decision.intent
            return result
        logger.error("tool_invalid_return tool=%s type=%s", tool_name, type(result).__name__)
        return failure_result(
            tool_name=tool_name,
            source="tool_executor",
            error="Tool returned an invalid response.",
        )
    except Exception as exc:
        logger.exception("tool_execution_failed tool=%s", tool_name)
        return failure_result(
            tool_name=tool_name,
            source="tool_executor",
            error=str(exc) or "Tool execution failed.",
        )
