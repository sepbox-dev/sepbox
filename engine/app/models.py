import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String
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