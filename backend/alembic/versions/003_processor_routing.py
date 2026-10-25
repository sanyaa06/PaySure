"""Add processor routing decisions tables.

Revision ID: 003_processor_routing
Revises: 002_chaos_lab_models
Create Date: 2026-10-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "003_processor_routing"
down_revision = "002_chaos_lab_models"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processor_routing_decisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("logical_operation_id", sa.String(length=128), nullable=False),
        sa.Column("processor_id", sa.String(length=64), nullable=False),
        sa.Column("routing_policy", sa.String(length=32), nullable=False),
        sa.Column("selection_reason", sa.String(length=256), nullable=False),
        sa.Column("observed_processor_health", sa.String(length=32), nullable=True),
        sa.Column("estimated_latency_ms", sa.BigInteger(), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=True),
        sa.Column("actual_latency_ms", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_processor_routing_decisions_payment_id", "processor_routing_decisions", ["payment_id"])
    op.create_index("ix_processor_routing_decisions_processor_id", "processor_routing_decisions", ["processor_id"])
    op.create_index("ix_processor_routing_decisions_routing_policy", "processor_routing_decisions", ["routing_policy"])
    op.create_index("ix_processor_routing_decisions_logical_operation_id", "processor_routing_decisions", ["logical_operation_id"])


def downgrade() -> None:
    op.drop_index("ix_processor_routing_decisions_logical_operation_id", table_name="processor_routing_decisions")
    op.drop_index("ix_processor_routing_decisions_routing_policy", table_name="processor_routing_decisions")
    op.drop_index("ix_processor_routing_decisions_processor_id", table_name="processor_routing_decisions")
    op.drop_index("ix_processor_routing_decisions_payment_id", table_name="processor_routing_decisions")
    op.drop_table("processor_routing_decisions")
