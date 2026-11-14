"""Request context middleware: request id, timing and access logging.

Implemented as a pure ASGI middleware (instead of ``BaseHTTPMiddleware``) so
streaming responses such as Server-Sent Events are forwarded without buffering
and client disconnects propagate normally.
"""

from __future__ import annotations

import logging
import re
import time
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("app.request")

# Keep only characters that are safe in a header value and in a log line.
_REQUEST_ID_RE = re.compile(r"[^A-Za-z0-9._-]")
_MAX_REQUEST_ID_LENGTH = 64


def sanitize_request_id(value: str) -> str:
    """Return a header/log-safe request id (empty when nothing is left)."""

    return _REQUEST_ID_RE.sub("", value or "")[:_MAX_REQUEST_ID_LENGTH]


class RequestContextMiddleware:
    """Attach a request id and expose request timing to clients."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = (
            sanitize_request_id(headers.get("X-Request-ID", "")) or uuid4().hex
        )

        # Starlette exposes ``scope["state"]`` through ``request.state``, which
        # the exception handlers use to include the request id in the payload.
        state = scope.setdefault("state", {})
        state["request_id"] = request_id

        method = scope.get("method", "GET")
        path = scope.get("path", "/")
        started = time.perf_counter()
        status_code = 500

        logger.info("--> %s %s [%s]", method, path, request_id)

        async def send_with_context(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                elapsed_ms = (time.perf_counter() - started) * 1000
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Request-ID"] = request_id
                response_headers["X-Process-Time-Ms"] = f"{elapsed_ms:.2f}"
            await send(message)

        try:
            await self.app(scope, receive, send_with_context)
        except Exception:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.exception(
                "<-- %s %s 500 %.2fms [%s]", method, path, elapsed_ms, request_id
            )
            raise

        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "<-- %s %s %s %.2fms [%s]",
            method,
            path,
            status_code,
            elapsed_ms,
            request_id,
        )
