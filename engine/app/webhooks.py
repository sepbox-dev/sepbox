import hashlib
import hmac
import json
import secrets
import time
from datetime import timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import WebhookDelivery, WebhookSubscription

router = APIRouter(prefix="/admin/webhooks", tags=["Webhooks"])


def get_http_client() -> httpx.Client:
    return httpx.Client(timeout=3.0)


def sign_webhook_payload(secret: str, timestamp: int, raw_body: bytes) -> str:
    signed_content = f"{timestamp}.".encode("utf-8") + raw_body
    digest = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def verify_webhook_signature(
    secret: str,
    raw_body: bytes,
    signature_header: str,
    tolerance_seconds: int = 300,
) -> bool:
    parts: dict[str, str] = {}
    for segment in signature_header.split(","):
        if "=" not in segment:
            continue
        key, val = segment.split("=", 1)
        parts[key.strip()] = val.strip()

    ts_raw = parts.get("t")
    provided_sig = parts.get("v1")
    if not ts_raw or not provided_sig or not ts_raw.isdigit():
        return False

    timestamp = int(ts_raw)
    if abs(int(time.time()) - timestamp) > tolerance_seconds:
        return False

    expected = sign_webhook_payload(secret, timestamp, raw_body).split("v1=", 1)[1]
    return hmac.compare_digest(expected, provided_sig)


def _send_signed_webhook(
    url: str,
    secret: str,
    event_type: str,
    raw_body: bytes,
) -> tuple[str, str, int | None, str | None]:
    timestamp = int(time.time())
    signature = sign_webhook_payload(secret, timestamp, raw_body)
    headers = {
        "Content-Type": "application/json",
        "X-SEPBox-Event": event_type,
        "X-SEPBox-Signature": signature,
    }
    try:
        with get_http_client() as http:
            resp = http.post(url, content=raw_body, headers=headers)
        status = "delivered" if 200 <= resp.status_code < 300 else "failed"
        return signature, status, resp.status_code, resp.text[:500]
    except Exception as exc:
        return signature, "failed", None, str(exc)[:500]


def dispatch_transaction_webhook(
    db: Session,
    transaction_payload: dict[str, object],
    event_type: str = "sep24.transaction.updated",
) -> list[WebhookDelivery]:
    subs = db.execute(
        select(WebhookSubscription).where(WebhookSubscription.enabled.is_(True))
    ).scalars().all()
    if not subs:
        return []

    envelope = {
        "event": event_type,
        "timestamp": int(time.time()),
        "transaction": transaction_payload,
    }
    payload_json = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
    raw_body = payload_json.encode("utf-8")
    tx_id = str(transaction_payload.get("id", ""))

    deliveries: list[WebhookDelivery] = []
    for sub in subs:
        subscribed = {e.strip() for e in sub.events.split(",") if e.strip()}
        if "*" not in subscribed and event_type not in subscribed:
            continue

        signature, status, http_status, response_body = _send_signed_webhook(
            url=sub.url,
            secret=sub.secret,
            event_type=event_type,
            raw_body=raw_body,
        )
        delivery = WebhookDelivery(
            subscription_id=sub.id,
            event_type=event_type,
            transaction_id=tx_id,
            payload_json=payload_json,
            signature=signature,
            status=status,
            http_status=http_status,
            response_body=response_body,
            attempts=1,
        )
        db.add(delivery)
        deliveries.append(delivery)

    if deliveries:
        db.commit()
        for item in deliveries:
            db.refresh(item)
    return deliveries


def _serialize_subscription(sub: WebhookSubscription, include_secret: bool = False) -> dict[str, object]:
    data: dict[str, object] = {
        "id": sub.id,
        "url": sub.url,
        "events": [e.strip() for e in sub.events.split(",") if e.strip()],
        "enabled": sub.enabled,
        "created_at": sub.created_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if include_secret:
        data["secret"] = sub.secret
    else:
        data["secret_preview"] = f"{sub.secret[:8]}..."
    return data


def _serialize_delivery(delivery: WebhookDelivery) -> dict[str, object]:
    return {
        "id": delivery.id,
        "subscription_id": delivery.subscription_id,
        "event_type": delivery.event_type,
        "transaction_id": delivery.transaction_id,
        "signature": delivery.signature,
        "status": delivery.status,
        "http_status": delivery.http_status,
        "response_body": delivery.response_body,
        "attempts": delivery.attempts,
        "payload": json.loads(delivery.payload_json),
        "created_at": delivery.created_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


class WebhookSubscriptionCreate(BaseModel):
    url: str = Field(..., min_length=8, max_length=512)
    secret: str | None = Field(default=None, min_length=16, max_length=128)
    events: list[str] = Field(default_factory=lambda: ["sep24.transaction.updated"])
    enabled: bool = True


@router.post("", status_code=201)
def create_subscription(
    body: WebhookSubscriptionCreate,
    db: Session = Depends(get_db),
):
    url = body.url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return JSONResponse(status_code=400, content={"error": "Webhook URL must start with http:// or https://"})

    cleaned_events = [e.strip() for e in body.events if e.strip()]
    if not cleaned_events:
        return JSONResponse(status_code=400, content={"error": "At least one event type is required"})

    sub = WebhookSubscription(
        url=url,
        secret=body.secret or f"whsec_{secrets.token_hex(24)}",
        events=",".join(cleaned_events),
        enabled=body.enabled,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _serialize_subscription(sub, include_secret=True)


@router.get("")
def list_subscriptions(db: Session = Depends(get_db)):
    rows = db.execute(select(WebhookSubscription).order_by(desc(WebhookSubscription.created_at))).scalars().all()
    return {"subscriptions": [_serialize_subscription(row) for row in rows]}


@router.delete("/{subscription_id}")
def delete_subscription(subscription_id: str, db: Session = Depends(get_db)):
    sub = db.execute(
        select(WebhookSubscription).where(WebhookSubscription.id == subscription_id)
    ).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Webhook subscription not found")

    db.delete(sub)
    db.commit()
    return {"status": "deleted", "id": subscription_id}


@router.get("/deliveries")
def list_deliveries(
    transaction_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    stmt = select(WebhookDelivery).order_by(desc(WebhookDelivery.created_at)).limit(limit)
    if transaction_id:
        stmt = stmt.where(WebhookDelivery.transaction_id == transaction_id)

    rows = db.execute(stmt).scalars().all()
    return {"deliveries": [_serialize_delivery(row) for row in rows]}


@router.post("/deliveries/{delivery_id}/replay")
def replay_delivery(delivery_id: str, db: Session = Depends(get_db)):
    delivery = db.execute(
        select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
    ).scalar_one_or_none()
    if delivery is None:
        raise HTTPException(status_code=404, detail="Webhook delivery not found")

    sub = db.execute(
        select(WebhookSubscription).where(WebhookSubscription.id == delivery.subscription_id)
    ).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Parent webhook subscription not found")

    signature, status, http_status, response_body = _send_signed_webhook(
        url=sub.url,
        secret=sub.secret,
        event_type=delivery.event_type,
        raw_body=delivery.payload_json.encode("utf-8"),
    )
    delivery.signature = signature
    delivery.status = status
    delivery.http_status = http_status
    delivery.response_body = response_body
    delivery.attempts += 1

    db.commit()
    db.refresh(delivery)
    return _serialize_delivery(delivery)