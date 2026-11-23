import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class KycCustomer(Base):
    __tablename__ = "sep12_customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="NEEDS_INFO")
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Quote(Base):
    __tablename__ = "sep38_quotes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    context: Mapped[str] = mapped_column(String(16), nullable=False)
    sell_asset: Mapped[str] = mapped_column(String(128), nullable=False)
    buy_asset: Mapped[str] = mapped_column(String(128), nullable=False)
    sell_amount: Mapped[Decimal] = mapped_column(Numeric(24, 7), nullable=False)
    buy_amount: Mapped[Decimal] = mapped_column(Numeric(24, 7), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(24, 7), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(24, 7), nullable=False)
    fee_total: Mapped[Decimal] = mapped_column(Numeric(24, 7), nullable=False)
    fee_asset: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Sep24Transaction(Base):
    __tablename__ = "sep24_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="incomplete")
    asset_code: Mapped[str] = mapped_column(String(12), index=True, nullable=False)
    amount_in: Mapped[Decimal | None] = mapped_column(Numeric(24, 7), nullable=True)
    amount_out: Mapped[Decimal | None] = mapped_column(Numeric(24, 7), nullable=True)
    amount_fee: Mapped[Decimal | None] = mapped_column(Numeric(24, 7), nullable=True)
    quote_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    stellar_transaction_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_transaction_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    withdraw_anchor_account: Mapped[str | None] = mapped_column(String(56), nullable=True)
    withdraw_memo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    withdraw_memo_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class WebhookSubscription(Base):
    __tablename__ = "webhook_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    secret: Mapped[str] = mapped_column(String(128), nullable=False)
    events: Mapped[str] = mapped_column(String(255), nullable=False, default="sep24.transaction.updated")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    transaction_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    signature: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)