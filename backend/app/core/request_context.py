"""Request-scoped identifiers for tracing (async-safe via contextvars)."""

from __future__ import annotations

import contextvars
from typing import Optional

request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)


def get_request_id() -> str:
    rid = request_id_ctx.get()
    return rid if rid else "-"
