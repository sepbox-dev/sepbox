"""initial sep12 and sep38 tables

Revision ID: 0001_initial_sep_tables
Revises:
Create Date: 2026-11-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_sep_tables"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sep12_customers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("account", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="NEEDS_INFO"),
        sa.Column("first_name", sa.String(length=120), nullable=True),
        sa.Column("last_name", sa.String(length=120), nullable=True),
        sa.Column("email_address", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sep12_customers_account", "sep12_customers", ["account"], unique=True)

    op.create_table(
        "sep38_quotes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("account", sa.String(length=128), nullable=False),
        sa.Column("context", sa.String(length=16), nullable=False),
        sa.Column("sell_asset", sa.String(length=128), nullable=False),
        sa.Column("buy_asset", sa.String(length=128), nullable=False),
        sa.Column("sell_amount", sa.Numeric(24, 7), nullable=False),
        sa.Column("buy_amount", sa.Numeric(24, 7), nullable=False),
        sa.Column("price", sa.Numeric(24, 7), nullable=False),
        sa.Column("total_price", sa.Numeric(24, 7), nullable=False),
        sa.Column("fee_total", sa.Numeric(24, 7), nullable=False),
        sa.Column("fee_asset", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sep38_quotes_account", "sep38_quotes", ["account"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sep38_quotes_account", table_name="sep38_quotes")
    op.drop_table("sep38_quotes")
    op.drop_index("ix_sep12_customers_account", table_name="sep12_customers")
    op.drop_table("sep12_customers")