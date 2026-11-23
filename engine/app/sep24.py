import json
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.config import get_anchor_keypair, get_settings
from app.db import get_db
from app.models import Quote, Sep24Transaction, utc_now
from app.sep10 import get_authenticated_account
from app.webhooks import dispatch_transaction_webhook

router = APIRouter(prefix="/sep24", tags=["SEP-24"])

SUPPORTED_ASSETS = {"USDC", "XLM"}
QUANT = Decimal("0.0000001")
FEE_RATE = Decimal("0.005")

DEPOSIT_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "incomplete": ("pending_user_transfer_start", "pending_anchor", "error"),
    "pending_user_transfer_start": ("pending_anchor", "expired", "error"),
    "pending_anchor": ("pending_stellar", "error"),
    "pending_stellar": ("completed", "error"),
    "completed": (),
    "expired": (),
    "error": (),
}

WITHDRAWAL_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "incomplete": ("pending_user_transfer_start", "error"),
    "pending_user_transfer_start": ("pending_anchor", "expired", "error"),
    "pending_anchor": ("pending_external", "error"),
    "pending_external": ("completed", "error"),
    "completed": (),
    "expired": (),
    "error": (),
}


def _q(val: Decimal) -> Decimal:
    return val.quantize(QUANT, rounding=ROUND_HALF_UP)


def _fmt(val: Decimal | None) -> str | None:
    if val is None:
        return None
    return f"{_q(val):.7f}"


def _fmt_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _parse_payload(request: Request) -> dict[str, str]:
    content_type = (request.headers.get("content-type") or "").lower()
    raw_body = await request.body()

    if "application/x-www-form-urlencoded" in content_type:
        parsed = parse_qs(raw_body.decode("utf-8", errors="ignore"))
        return {k: v[0].strip() for k, v in parsed.items() if v}

    if not raw_body:
        return {}

    try:
        body_json = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON request body") from exc

    if not isinstance(body_json, dict):
        raise ValueError("Request body must be a JSON object")

    return {k: str(v).strip() for k, v in body_json.items() if v is not None}


def _serialize_transaction(tx: Sep24Transaction) -> dict[str, object]:
    settings = get_settings()
    base_url = f"http://{settings.anchor_home_domain}"
    data: dict[str, object] = {
        "id": tx.id,
        "kind": tx.kind,
        "status": tx.status,
        "asset_code": tx.asset_code,
        "more_info_url": f"{base_url}/sep24/interactive/{tx.id}",
        "started_at": _fmt_dt(tx.started_at),
        "updated_at": _fmt_dt(tx.updated_at),
        "completed_at": _fmt_dt(tx.completed_at),
        "amount_in": _fmt(tx.amount_in),
        "amount_out": _fmt(tx.amount_out),
        "amount_fee": _fmt(tx.amount_fee),
        "quote_id": tx.quote_id,
        "stellar_transaction_id": tx.stellar_transaction_id,
        "external_transaction_id": tx.external_transaction_id,
        "message": tx.message,
    }
    if tx.kind == "withdrawal":
        data["withdraw_anchor_account"] = tx.withdraw_anchor_account
        data["withdraw_memo"] = tx.withdraw_memo
        data["withdraw_memo_type"] = tx.withdraw_memo_type
    return data


class AdvanceTransactionRequest(BaseModel):
    status: str | None = None
    message: str | None = None
    stellar_transaction_id: str | None = None
    external_transaction_id: str | None = None


@router.get("/info")
def get_sep24_info():
    asset_config = {
        "enabled": True,
        "min_amount": 1.0,
        "max_amount": 100000.0,
        "fee_fixed": 0.0,
        "fee_percent": 0.5,
    }
    return {
        "deposit": {
            "USDC": asset_config,
            "XLM": asset_config,
        },
        "withdraw": {
            "USDC": asset_config,
            "XLM": asset_config,
        },
        "fee": {"enabled": False},
        "features": {
            "account_creation": True,
            "claimable_balances": False,
        },
    }


async def _create_interactive_tx(
    kind: str,
    request: Request,
    auth_subject: str,
    db: Session,
) -> JSONResponse | dict[str, str]:
    try:
        payload = await _parse_payload(request)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    asset_code = (payload.get("asset_code") or "").upper()
    if asset_code not in SUPPORTED_ASSETS:
        return JSONResponse(
            status_code=400,
            content={"error": f"Unsupported asset_code: {asset_code or '(missing)'}"},
        )

    amount_in: Decimal | None = None
    amount_out: Decimal | None = None
    amount_fee: Decimal | None = None
    quote_id = payload.get("quote_id") or None

    if quote_id:
        quote = db.execute(
            select(Quote).where(Quote.id == quote_id, Quote.account == auth_subject)
        ).scalar_one_or_none()
        if quote is None:
            return JSONResponse(status_code=400, content={"error": "Referenced quote_id not found"})
        if quote.expires_at <= utc_now():
            return JSONResponse(status_code=400, content={"error": "Referenced quote_id has expired"})
        amount_in = quote.sell_amount
        amount_out = quote.buy_amount
        amount_fee = quote.fee_total
    elif payload.get("amount"):
        try:
            parsed_amount = Decimal(payload["amount"])
        except InvalidOperation:
            return JSONResponse(status_code=400, content={"error": "Invalid decimal amount"})
        if parsed_amount <= 0:
            return JSONResponse(status_code=400, content={"error": "Amount must be greater than zero"})
        amount_in = _q(parsed_amount)
        amount_fee = _q(amount_in * FEE_RATE)
        amount_out = _q(amount_in - amount_fee)

    tx = Sep24Transaction(
        account=auth_subject,
        kind=kind,
        status="incomplete",
        asset_code=asset_code,
        amount_in=amount_in,
        amount_out=amount_out,
        amount_fee=amount_fee,
        quote_id=quote_id,
    )

    if kind == "withdrawal":
        tx.withdraw_anchor_account = get_anchor_keypair().public_key
        tx.withdraw_memo = str(secrets.randbelow(900_000_000_000) + 100_000_000_000)
        tx.withdraw_memo_type = "id"

    db.add(tx)
    db.commit()
    db.refresh(tx)

    settings = get_settings()
    return {
        "type": "interactive_customer_info_needed",
        "url": f"http://{settings.anchor_home_domain}/sep24/interactive/{tx.id}",
        "id": tx.id,
    }


@router.post("/transactions/deposit/interactive")
async def start_interactive_deposit(
    request: Request,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    return await _create_interactive_tx("deposit", request, auth_subject, db)


@router.post("/transactions/withdraw/interactive")
async def start_interactive_withdraw(
    request: Request,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    return await _create_interactive_tx("withdrawal", request, auth_subject, db)


@router.get("/transaction")
def get_transaction(
    tx_id: str | None = Query(default=None, alias="id"),
    stellar_transaction_id: str | None = Query(default=None),
    external_transaction_id: str | None = Query(default=None),
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    if not any([tx_id, stellar_transaction_id, external_transaction_id]):
        return JSONResponse(
            status_code=400,
            content={"error": "Provide one of id, stellar_transaction_id, or external_transaction_id"},
        )

    stmt = select(Sep24Transaction).where(Sep24Transaction.account == auth_subject)
    if tx_id:
        stmt = stmt.where(Sep24Transaction.id == tx_id)
    if stellar_transaction_id:
        stmt = stmt.where(Sep24Transaction.stellar_transaction_id == stellar_transaction_id)
    if external_transaction_id:
        stmt = stmt.where(Sep24Transaction.external_transaction_id == external_transaction_id)

    tx = db.execute(stmt).scalar_one_or_none()
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {"transaction": _serialize_transaction(tx)}


@router.get("/transactions")
def list_transactions(
    asset_code: str = Query(...),
    kind: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Sep24Transaction)
        .where(
            Sep24Transaction.account == auth_subject,
            Sep24Transaction.asset_code == asset_code.upper(),
        )
        .order_by(desc(Sep24Transaction.started_at))
        .limit(limit)
    )
    if kind:
        stmt = stmt.where(Sep24Transaction.kind == kind)

    rows = db.execute(stmt).scalars().all()
    return {"transactions": [_serialize_transaction(row) for row in rows]}


@router.post("/transactions/{tx_id}/advance")
def advance_transaction_state(
    tx_id: str,
    body: AdvanceTransactionRequest | None = None,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    tx = db.execute(
        select(Sep24Transaction)
        .where(Sep24Transaction.id == tx_id, Sep24Transaction.account == auth_subject)
        .with_for_update()
    ).scalar_one_or_none()

    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    transitions = DEPOSIT_TRANSITIONS if tx.kind == "deposit" else WITHDRAWAL_TRANSITIONS
    allowed_next = transitions.get(tx.status, ())

    if not allowed_next:
        raise HTTPException(
            status_code=409,
            detail=f"Transaction in terminal state '{tx.status}' cannot transition further",
        )

    target_status = body.status if (body and body.status) else allowed_next[0]
    if target_status not in allowed_next:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid transition for {tx.kind}: '{tx.status}' -> '{target_status}' (allowed: {list(allowed_next)})",
        )

    tx.status = target_status
    if body and body.message is not None:
        tx.message = body.message
    if body and body.external_transaction_id:
        tx.external_transaction_id = body.external_transaction_id

    if target_status == "completed":
        tx.completed_at = utc_now()
        tx.stellar_transaction_id = (
            (body.stellar_transaction_id if body and body.stellar_transaction_id else None)
            or tx.stellar_transaction_id
            or secrets.token_hex(32)
        )

    db.commit()
    db.refresh(tx)

    serialized = _serialize_transaction(tx)
    dispatch_transaction_webhook(db, serialized, event_type="sep24.transaction.updated")
    return {"transaction": serialized}