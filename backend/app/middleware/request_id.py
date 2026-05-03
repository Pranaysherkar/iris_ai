"""Attach a stable request id for tracing (logs, support, client headers)."""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.request_context import request_id_ctx


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        header_rid = request.headers.get("x-request-id")
        rid = header_rid.strip() if header_rid and header_rid.strip() else str(uuid.uuid4())
        # Do not reset the contextvar after the handler: StreamingResponse bodies run
        # after call_next returns; the next request overwrites this value.
        request_id_ctx.set(rid)
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
