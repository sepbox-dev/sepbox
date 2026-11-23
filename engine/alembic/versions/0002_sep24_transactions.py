"""add sep24_transactions table

Revision ID: 0002_sep24_transactions
Revises: 0001_initial_sep_tables
Create Date: 2026-11-23 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_sep24_transactions"
down_revision: Union[str, None] = "0001_initial_sep_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sep24_transactions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("account", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="incomplete"),
        sa.Column("asset_code", sa.String(length=12), nullable=False),
        sa.Column("amount_in", sa.Numeric(24, 7), nullable=True),
        sa.Column("amount_out", sa.Numeric(24, 7), nullable=True),
        sa.Column("amount_fee", sa.Numeric(24, 7), nullable=True),
        sa.Column("quote_id", sa.String(length=36), nullable=True),
        sa.Column("stellar_transaction_id", sa.String(length=64), nullable=True),
        sa.Column("external_transaction_id", sa.String(length=64), nullable=True),
        sa.Column("withdraw_anchor_account", sa.String(length=56), nullable=True),
        sa.Column("withdraw_memo", sa.String(length=64), nullable=True),
        sa.Column("withdraw_memo_type", sa.String(length=16), nullable=True),
        sa.Column("message", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sep24_transactions_account", "sep24_transactions", ["account"], unique=False)
    op.create_index("ix_sep24_transactions_asset_code", "sep24_transactions", ["asset_code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sep24_transactions_asset_code", table_name="sep24_transactions")
    op.drop_index("ix_sep24_transactions_account", table_name="sep24_transactions")
    op.drop_table("sep24_transactions")