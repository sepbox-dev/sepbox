import asyncio
import random
import threading
from dataclasses import dataclass

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin/chaos", tags=["Chaos"])

PROTECTED_PREFIXES = ("/health", "/admin/", "/docs", "/openapi.json")


@dataclass
class ChaosState:
    enabled: bool = False
    target_prefix: str = "/sep"
    latency_ms: int = 0
    error_rate: float = 0.0
    error_status: int = 503
    error_message: str = "Injected SEPBox chaos fault"
    corrupt_json: bool = False
    total_inspected: int = 0
    injected_errors: int = 0
    injected_delays: int = 0


_lock = threading.Lock()
_state = ChaosState()


class ChaosConfigUpdate(BaseModel):
    enabled: bool = True
    target_prefix: str = Field(default="/sep", min_length=1, max_length=128)
    latency_ms: int = Field(default=0, ge=0, le=10000)
    error_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    error_status: int = Field(default=503, ge=400, le=599)
    error_message: str = Field(default="Injected SEPBox chaos fault", min_length=1, max_length=255)
    corrupt_json: bool = False


def _snapshot() -> dict[str, object]:
    with _lock:
        return {
            "enabled": _state.enabled,
            "target_prefix": _state.target_prefix,
            "latency_ms": _state.latency_ms,
            "error_rate": _state.error_rate,
            "error_status": _state.error_status,
            "error_message": _state.error_message,
            "corrupt_json": _state.corrupt_json,
            "stats": {
                "total_inspected": _state.total_inspected,
                "injected_errors": _state.injected_errors,
                "injected_delays": _state.injected_delays,
            },
        }


@router.get("")
def get_chaos_config():
    return _snapshot()


@router.put("")
def update_chaos_config(body: ChaosConfigUpdate):
    with _lock:
        _state.enabled = body.enabled
        _state.target_prefix = body.target_prefix
        _state.latency_ms = body.latency_ms
        _state.error_rate = body.error_rate
        _state.error_status = body.error_status
        _state.error_message = body.error_message
        _state.corrupt_json = body.corrupt_json
    return _snapshot()


@router.post("/reset")
def reset_chaos_config():
    with _lock:
        _state.enabled = False
        _state.target_prefix = "/sep"
        _state.latency_ms = 0
        _state.error_rate = 0.0
        _state.error_status = 503
        _state.error_message = "Injected SEPBox chaos fault"
        _state.corrupt_json = False
        _state.total_inspected = 0
        _state.injected_errors = 0
        _state.injected_delays = 0
    return _snapshot()


async def chaos_middleware(request: Request, call_next):
    path = request.url.path
    if any(path.startswith(prefix) for prefix in PROTECTED_PREFIXES):
        return await call_next(request)

    with _lock:
        if not _state.enabled or not path.startswith(_state.target_prefix):
            return await call_next(request)
        _state.total_inspected += 1
        latency_ms = _state.latency_ms
        error_rate = _state.error_rate
        error_status = _state.error_status
        error_message = _state.error_message
        corrupt_json = _state.corrupt_json

    if latency_ms > 0:
        await asyncio.sleep(latency_ms / 1000.0)
        with _lock:
            _state.injected_delays += 1

    if corrupt_json:
        with _lock:
            _state.injected_errors += 1
        return PlainTextResponse(
            content='{"sepbox_chaos": "truncated_json',
            status_code=200,
            media_type="application/json",
            headers={"X-SEPBox-Chaos-Injected": "true"},
        )

    if error_rate > 0.0 and random.random() < error_rate:
        with _lock:
            _state.injected_errors += 1
        return JSONResponse(
            status_code=error_status,
            content={"error": error_message, "chaos_injected": True},
            headers={"X-SEPBox-Chaos-Injected": "true"},
        )

    response = await call_next(request)
    if latency_ms > 0:
        response.headers["X-SEPBox-Chaos-Latency-Ms"] = str(latency_ms)
    return response