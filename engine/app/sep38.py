from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_anchor_keypair
from app.db import get_db
from app.models import Quote
from app.sep10 import get_authenticated_account

router = APIRouter(prefix="/sep38", tags=["SEP-38"])

QUANT = Decimal("0.0000001")
FEE_RATE = Decimal("0.005")  # 0.5% deterministic anchor conversion fee
VALID_CONTEXTS = {"sep6", "sep24", "sep31"}
DEFAULT_QUOTE_TTL_SECONDS = 300
MAX_QUOTE_TTL_SECONDS = 3600


def _q(val: Decimal) -> Decimal:
    return val.quantize(QUANT, rounding=ROUND_HALF_UP)


def _fmt(val: Decimal) -> str:
    return f"{_q(val):.7f}"


def _usdc_asset_id() -> str:
    return f"stellar:USDC:{get_anchor_keypair().public_key}"


def _rates_per_usd() -> dict[str, Decimal]:
    return {
        "iso4217:USD": Decimal("1.0000000"),
        _usdc_asset_id(): Decimal("1.0000000"),
        "iso4217:NGN": Decimal("1600.0000000"),
        "stellar:native": Decimal("4.0000000"),
    }


def _parse_positive_decimal(raw: str, field_name: str) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid decimal for {field_name}") from exc
    if value <= 0:
        raise ValueError(f"{field_name} must be greater than zero")
    return value


def _compute_quote(
    sell_asset: str,
    buy_asset: str,
    sell_amount_str: str | None,
    buy_amount_str: str | None,
) -> dict[str, Decimal | str]:
    rates = _rates_per_usd()
    if sell_asset not in rates:
        raise ValueError(f"Unsupported sell_asset: {sell_asset}")
    if buy_asset not in rates:
        raise ValueError(f"Unsupported buy_asset: {buy_asset}")
    if sell_asset == buy_asset:
        raise ValueError("sell_asset and buy_asset must be different")

    if bool(sell_amount_str) == bool(buy_amount_str):
        raise ValueError("Provide exactly one of sell_amount or buy_amount")

    # SEP-38: price = units of sell_asset per 1 unit of buy_asset (excluding fee)
    unit_price = _q(rates[sell_asset] / rates[buy_asset])

    if sell_amount_str is not None:
        sell_amount = _q(_parse_positive_decimal(sell_amount_str, "sell_amount"))
        fee_total = _q(sell_amount * FEE_RATE)
        net_sell = sell_amount - fee_total
        if net_sell <= 0:
            raise ValueError("sell_amount too small to cover conversion fee")
        buy_amount = _q(net_sell / unit_price)
        if buy_amount <= 0:
            raise ValueError("Calculated buy_amount is zero")
        total_price = _q(sell_amount / buy_amount)
    else:
        assert buy_amount_str is not None
        buy_amount = _q(_parse_positive_decimal(buy_amount_str, "buy_amount"))
        base_sell = _q(buy_amount * unit_price)
        fee_total = _q(base_sell * FEE_RATE)
        sell_amount = _q(base_sell + fee_total)
        total_price = _q(sell_amount / buy_amount)

    return {
        "sell_asset": sell_asset,
        "buy_asset": buy_asset,
        "sell_amount": sell_amount,
        "buy_amount": buy_amount,
        "price": unit_price,
        "total_price": total_price,
        "fee_total": fee_total,
        "fee_asset": sell_asset,
    }


def _serialize_quote(quote: Quote) -> dict[str, object]:
    expires_utc = quote.expires_at.astimezone(timezone.utc)
    return {
        "id": quote.id,
        "expires_at": expires_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_price": _fmt(quote.total_price),
        "price": _fmt(quote.price),
        "sell_asset": quote.sell_asset,
        "sell_amount": _fmt(quote.sell_amount),
        "buy_asset": quote.buy_asset,
        "buy_amount": _fmt(quote.buy_amount),
        "fee": {
            "total": _fmt(quote.fee_total),
            "asset": quote.fee_asset,
            "details": [
                {
                    "name": "Anchor conversion fee",
                    "description": "0.5% deterministic SEPBox spread fee",
                    "amount": _fmt(quote.fee_total),
                }
            ],
        },
    }


class FirmQuoteRequest(BaseModel):
    context: str
    sell_asset: str
    buy_asset: str
    sell_amount: str | None = None
    buy_amount: str | None = None
    expire_after: str | None = None


@router.get("/info")
def get_sep38_info():
    usdc = _usdc_asset_id()
    return {
        "assets": [
            {
                "asset": usdc,
            },
            {
                "asset": "stellar:native",
            },
            {
                "asset": "iso4217:USD",
                "country_codes": ["USA"],
                "sell_delivery_methods": [
                    {"name": "ACH", "description": "US ACH Bank Transfer"},
                    {"name": "WIRE", "description": "US Domestic/International Wire"},
                ],
                "buy_delivery_methods": [
                    {"name": "ACH", "description": "US ACH Bank Payout"},
                ],
            },
            {
                "asset": "iso4217:NGN",
                "country_codes": ["NGA"],
                "sell_delivery_methods": [
                    {"name": "NIP", "description": "Nigeria Instant Bank Transfer"},
                ],
                "buy_delivery_methods": [
                    {"name": "NIP", "description": "Nigeria Instant Bank Payout"},
                ],
            },
        ]
    }


@router.get("/prices")
def get_indicative_prices(
    sell_asset: str | None = Query(default=None),
    buy_asset: str | None = Query(default=None),
    sell_amount: str | None = Query(default=None),
    buy_amount: str | None = Query(default=None),
):
    rates = _rates_per_usd()

    if sell_asset and sell_amount and not buy_asset and not buy_amount:
        if sell_asset not in rates:
            return JSONResponse(status_code=400, content={"error": f"Unsupported sell_asset: {sell_asset}"})
        try:
            _parse_positive_decimal(sell_amount, "sell_amount")
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})

        buy_assets = []
        for target_asset in rates:
            if target_asset == sell_asset:
                continue
            calc = _compute_quote(sell_asset, target_asset, sell_amount, None)
            buy_assets.append(
                {
                    "asset": target_asset,
                    "price": _fmt(calc["price"]),
                    "decimals": 7,
                }
            )
        return {"buy_assets": buy_assets}

    if buy_asset and buy_amount and not sell_asset and not sell_amount:
        if buy_asset not in rates:
            return JSONResponse(status_code=400, content={"error": f"Unsupported buy_asset: {buy_asset}"})
        try:
            _parse_positive_decimal(buy_amount, "buy_amount")
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})

        sell_assets = []
        for source_asset in rates:
            if source_asset == buy_asset:
                continue
            calc = _compute_quote(source_asset, buy_asset, None, buy_amount)
            sell_assets.append(
                {
                    "asset": source_asset,
                    "price": _fmt(calc["price"]),
                    "decimals": 7,
                }
            )
        return {"sell_assets": sell_assets}

    return JSONResponse(
        status_code=400,
        content={"error": "Provide either (sell_asset + sell_amount) or (buy_asset + buy_amount)"},
    )


@router.get("/price")
def get_indicative_price(
    sell_asset: str = Query(...),
    buy_asset: str = Query(...),
    context: str = Query(...),
    sell_amount: str | None = Query(default=None),
    buy_amount: str | None = Query(default=None),
):
    if context not in VALID_CONTEXTS:
        return JSONResponse(status_code=400, content={"error": f"Unsupported context: {context}"})

    try:
        calc = _compute_quote(sell_asset, buy_asset, sell_amount, buy_amount)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    return {
        "total_price": _fmt(calc["total_price"]),
        "price": _fmt(calc["price"]),
        "sell_amount": _fmt(calc["sell_amount"]),
        "buy_amount": _fmt(calc["buy_amount"]),
        "fee": {
            "total": _fmt(calc["fee_total"]),
            "asset": calc["fee_asset"],
        },
    }


@router.post("/quote", status_code=201)
def create_firm_quote(
    body: FirmQuoteRequest,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    if body.context not in VALID_CONTEXTS:
        return JSONResponse(status_code=400, content={"error": f"Unsupported context: {body.context}"})

    try:
        calc = _compute_quote(body.sell_asset, body.buy_asset, body.sell_amount, body.buy_amount)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=DEFAULT_QUOTE_TTL_SECONDS)

    if body.expire_after:
        try:
            requested_exp = datetime.fromisoformat(body.expire_after.replace("Z", "+00:00"))
            if requested_exp.tzinfo is None:
                requested_exp = requested_exp.replace(tzinfo=timezone.utc)
        except ValueError:
            return JSONResponse(status_code=400, content={"error": "Invalid ISO-8601 expire_after timestamp"})

        if requested_exp <= now:
            return JSONResponse(status_code=400, content={"error": "expire_after must be in the future"})
        if requested_exp > now + timedelta(seconds=MAX_QUOTE_TTL_SECONDS):
            return JSONResponse(
                status_code=400,
                content={"error": "Cannot guarantee quote longer than 3600 seconds"},
            )
        expires_at = max(expires_at, requested_exp)

    quote = Quote(
        account=auth_subject,
        context=body.context,
        sell_asset=str(calc["sell_asset"]),
        buy_asset=str(calc["buy_asset"]),
        sell_amount=calc["sell_amount"],
        buy_amount=calc["buy_amount"],
        price=calc["price"],
        total_price=calc["total_price"],
        fee_total=calc["fee_total"],
        fee_asset=str(calc["fee_asset"]),
        expires_at=expires_at,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    return _serialize_quote(quote)


@router.get("/quote/{quote_id}")
def get_firm_quote(
    quote_id: str,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    quote = db.execute(
        select(Quote).where(Quote.id == quote_id, Quote.account == auth_subject)
    ).scalar_one_or_none()

    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")

    return _serialize_quote(quote)