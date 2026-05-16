"""Shared types for intent routing and tool execution."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Intent(str, Enum):
    GENERAL_CHAT = "general_chat"
    DATETIME = "datetime"
    LIVE_WEATHER = "live_weather"
    CURRENT_NEWS = "current_news"
    WEB_FACTS = "web_facts"
    ENCYCLOPEDIA = "encyclopedia"
    EXCHANGE_RATES = "exchange_rates"
    USER_DATA = "user_data"


class RouteDecision(BaseModel):
    intent: Intent
    needs_tool: bool = False
    tool_name: Optional[str] = None
    tool_args: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 1.0
    clarify: Optional[str] = None


class ToolResult(BaseModel):
    success: bool
    tool_name: str
    source: str
    fetched_at: str
    data: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    intent: Optional[Intent] = None
