"""Add chaos lab experiment tables.

Revision ID: 002_chaos_lab_models
Revises: 001_initial_schema
Create Date: 2026-10-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "002_chaos_lab_models"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chaos_experiments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("final_verdict", sa.String(length=32), nullable=True),
        sa.Column("related_payment_ids", sa.JSON(), nullable=False),
        sa.Column("error_summary", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chaos_experiments_scenario_id", "chaos_experiments", ["scenario_id"], unique=False)
    op.create_index("ix_chaos_experiments_status", "chaos_experiments", ["status"], unique=False)
    op.create_index("ix_chaos_experiments_started_at", "chaos_experiments", ["started_at"], unique=False)
    op.create_index("ix_chaos_experiments_final_verdict", "chaos_experiments", ["final_verdict"], unique=False)
    op.create_index("ix_chaos_experiments_status_start", "chaos_experiments", ["status", "started_at"], unique=False)

    op.create_table(
        "chaos_experiment_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["experiment_id"], ["chaos_experiments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chaos_experiment_events_experiment_id", "chaos_experiment_events", ["experiment_id"], unique=False)
    op.create_index("ix_chaos_experiment_events_timestamp", "chaos_experiment_events", ["timestamp"], unique=False)
    op.create_index("ix_chaos_experiment_events_event_type", "chaos_experiment_events", ["event_type"], unique=False)

    op.create_table(
        "chaos_invariant_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("invariant_name", sa.String(length=128), nullable=False),
        sa.Column("expected_condition", sa.String(length=256), nullable=False),
        sa.Column("observed_condition", sa.String(length=256), nullable=False),
        sa.Column("verdict", sa.String(length=32), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["experiment_id"], ["chaos_experiments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chaos_invariant_results_experiment_id", "chaos_invariant_results", ["experiment_id"], unique=False)
    op.create_index("ix_chaos_invariant_results_invariant_name", "chaos_invariant_results", ["invariant_name"], unique=False)
    op.create_index("ix_chaos_invariant_results_verdict", "chaos_invariant_results", ["verdict"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_chaos_invariant_results_verdict", table_name="chaos_invariant_results")
    op.drop_index("ix_chaos_invariant_results_invariant_name", table_name="chaos_invariant_results")
    op.drop_index("ix_chaos_invariant_results_experiment_id", table_name="chaos_invariant_results")
    op.drop_table("chaos_invariant_results")

    op.drop_index("ix_chaos_experiment_events_event_type", table_name="chaos_experiment_events")
    op.drop_index("ix_chaos_experiment_events_timestamp", table_name="chaos_experiment_events")
    op.drop_index("ix_chaos_experiment_events_experiment_id", table_name="chaos_experiment_events")
    op.drop_table("chaos_experiment_events")

    op.drop_index("ix_chaos_experiments_status_start", table_name="chaos_experiments")
    op.drop_index("ix_chaos_experiments_final_verdict", table_name="chaos_experiments")
    op.drop_index("ix_chaos_experiments_started_at", table_name="chaos_experiments")
    op.drop_index("ix_chaos_experiments_status", table_name="chaos_experiments")
    op.drop_index("ix_chaos_experiments_scenario_id", table_name="chaos_experiments")
    op.drop_table("chaos_experiments")
