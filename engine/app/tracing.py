from __future__ import annotations

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_HEADER_BYTES = b"x-request-id"
_CHAOS_HEADER_BYTES = b"x-sepbox-chaos-injected"
_VALID_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

request_id_ctx: ContextVar[str] = ContextVar("sepbox_request_id", default="")

access_logger = logging.getLogger("sepbox.access")
if not access_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    access_logger.addHandler(_handler)
    access_logger.setLevel(logging.INFO)


def get_request_id() -> str:
    """Return the active request's correlation ID from contextvars."""
    return request_id_ctx.get()


def _resolve_request_id(headers: list[tuple[bytes, bytes]]) -> str:
    for key, value in headers:
        if key.lower() == _REQUEST_ID_HEADER_BYTES:
            candidate = value.decode("latin-1").strip()
            if _VALID_REQUEST_ID_RE.match(candidate):
                return candidate
            break
    return str(uuid.uuid4())


class RequestTracingMiddleware:
    """Pure ASGI middleware that assigns/propagates X-Request-ID and emits JSON access logs."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _resolve_request_id(scope.get("headers", []))
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_ctx.set(request_id)

        start = time.perf_counter()
        status_code = 500
        chaos_injected = False

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code, chaos_injected
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                raw_headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                cleaned_headers: list[tuple[bytes, bytes]] = []
                for key, value in raw_headers:
                    lower_key = key.lower()
                    if lower_key == _CHAOS_HEADER_BYTES and value.lower() == b"true":
                        chaos_injected = True
                    if lower_key != _REQUEST_ID_HEADER_BYTES:
                        cleaned_headers.append((key, value))
                cleaned_headers.append((_REQUEST_ID_HEADER_BYTES, request_id.encode("ascii")))
                message = {**message, "headers": cleaned_headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
            record: dict[str, Any] = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event": "http_request",
                "request_id": request_id,
                "method": scope.get("method", "UNKNOWN"),
                "path": scope.get("path", ""),
                "status_code": status_code,
                "duration_ms": duration_ms,
                "chaos_injected": chaos_injected,
            }
            access_logger.info(json.dumps(record, separators=(",", ":")))
            request_id_ctx.reset(token)