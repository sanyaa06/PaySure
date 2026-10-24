"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-23 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create payments table
    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False, comment="Amount in minor units"),
        sa.Column("currency", sa.String(length=3), nullable=False, comment="ISO 4217 currency"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="CREATED"),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("captured_amount", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("refunded_amount", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("client_id", sa.String(length=64), nullable=True),
        sa.Column("request_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="chk_payment_amount_positive"),
        sa.CheckConstraint("captured_amount >= 0", name="chk_payment_captured_amount_non_negative"),
        sa.CheckConstraint("refunded_amount >= 0", name="chk_payment_refunded_amount_non_negative"),
        sa.CheckConstraint("refunded_amount <= captured_amount", name="chk_payment_refund_le_captured"),
        sa.CheckConstraint("length(currency) = 3", name="chk_payment_currency_length"),
    )
    op.create_index("ix_payments_idempotency_key", "payments", ["idempotency_key"], unique=True)
    op.create_index("ix_payments_status", "payments", ["status"])
    op.create_index("ix_payments_client_id", "payments", ["client_id"])
    op.create_index("ix_payments_client_created", "payments", ["client_id", "created_at"])
    op.create_index("ix_payments_status_created", "payments", ["status", "created_at"])

    # 2. Create payment_events audit table
    op.create_table(
        "payment_events",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("previous_status", sa.String(length=32), nullable=True),
        sa.Column("new_status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("event_metadata", sa.JSON(), nullable=False),
    )
    op.create_index("ix_payment_events_payment_id", "payment_events", ["payment_id"])
    op.create_index("ix_payment_events_event_type", "payment_events", ["event_type"])
    op.create_index("ix_payment_events_created_at", "payment_events", ["created_at"])
    op.create_index("ix_payment_events_pid_created", "payment_events", ["payment_id", "created_at"])

    # 3. Create processor_attempts table
    op.create_table(
        "processor_attempts",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("processor_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="PENDING"),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_processor_attempts_payment_id", "processor_attempts", ["payment_id"])
    op.create_index("ix_processor_attempts_processor_id", "processor_attempts", ["processor_id"])
    op.create_index("ix_processor_attempts_status", "processor_attempts", ["status"])
    op.create_index("ix_processor_attempts_started_at", "processor_attempts", ["started_at"])
    op.create_index("ix_proc_attempts_pid_started", "processor_attempts", ["payment_id", "started_at"])
    op.create_index("ix_proc_attempts_proc_status", "processor_attempts", ["processor_id", "status"])


def downgrade() -> None:
    op.drop_table("processor_attempts")
    op.drop_table("payment_events")
    op.drop_table("payments")
