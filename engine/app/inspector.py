import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.chaos import get_chaos_config
from app.config import get_anchor_keypair, get_settings
from app.db import get_db
from app.models import KycCustomer, Quote, Sep24Transaction, WebhookDelivery, WebhookSubscription

router = APIRouter(prefix="/admin", tags=["Inspector"])

BUFFER_CAPACITY = 200
_lock = threading.Lock()
_buffer: deque[dict[str, object]] = deque(maxlen=BUFFER_CAPACITY)


async def traffic_inspector_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/admin/") or request.method == "OPTIONS":
        return await call_next(request)

    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000.0, 2)

    entry: dict[str, object] = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "method": request.method,
        "path": path,
        "query": str(request.url.query),
        "status_code": response.status_code,
        "duration_ms": duration_ms,
        "content_type": response.headers.get("content-type", ""),
        "chaos_injected": response.headers.get("x-sepbox-chaos-injected") == "true",
    }
    with _lock:
        _buffer.appendleft(entry)

    return response


@router.get("/traffic")
def get_traffic_log(
    prefix: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=BUFFER_CAPACITY),
):
    with _lock:
        items = list(_buffer)

    if prefix:
        items = [item for item in items if str(item["path"]).startswith(prefix)]

    sliced = items[:limit]
    return {
        "events": sliced,
        "count": len(sliced),
        "total_buffered": len(items),
        "capacity": BUFFER_CAPACITY,
    }


@router.delete("/traffic")
def clear_traffic_log():
    with _lock:
        _buffer.clear()
    return {"status": "cleared", "count": 0}


@router.get("/overview")
def get_admin_overview(db: Session = Depends(get_db)):
    settings = get_settings()
    keypair = get_anchor_keypair()

    with _lock:
        buffered_requests = len(_buffer)

    return {
        "anchor": {
            "home_domain": settings.anchor_home_domain,
            "network_passphrase": settings.stellar_network_passphrase,
            "signing_public_key": keypair.public_key,
        },
        "counts": {
            "sep12_customers": db.execute(select(func.count(KycCustomer.id))).scalar_one(),
            "sep38_quotes": db.execute(select(func.count(Quote.id))).scalar_one(),
            "sep24_transactions": db.execute(select(func.count(Sep24Transaction.id))).scalar_one(),
            "webhook_subscriptions": db.execute(select(func.count(WebhookSubscription.id))).scalar_one(),
            "webhook_deliveries": db.execute(select(func.count(WebhookDelivery.id))).scalar_one(),
            "buffered_requests": buffered_requests,
        },
        "chaos": get_chaos_config(),
    }