"""Runtime context passed into tool execution (auth-scoped)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ToolRunContext(BaseModel):
    user_id: Optional[str] = None
    conversation_id: Optional[str] = None
