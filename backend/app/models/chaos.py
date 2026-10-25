from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class ChaosExperiment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chaos_experiments"

    scenario_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING", index=True)
    configuration: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=True,
        index=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    final_verdict: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    related_payment_ids: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    error_summary: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    events: Mapped[List["ChaosExperimentEvent"]] = relationship(
        "ChaosExperimentEvent",
        back_populates="experiment",
        cascade="all, delete-orphan",
        order_by="ChaosExperimentEvent.timestamp.asc()",
    )
    invariant_results: Mapped[List["ChaosInvariantResult"]] = relationship(
        "ChaosInvariantResult",
        back_populates="experiment",
        cascade="all, delete-orphan",
        order_by="ChaosInvariantResult.created_at.asc()",
    )

    __table_args__ = (
        Index("ix_chaos_experiment_status_start", "status", "started_at"),
    )



class ChaosExperimentEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chaos_experiment_events"

    experiment_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chaos_experiments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )

    description: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )

    event_metadata: Mapped[Dict[str, Any]] = mapped_column(
        "metadata",
        JSON,
        nullable=False,
        default=dict,
    )

    experiment: Mapped["ChaosExperiment"] = relationship(
        "ChaosExperiment",
        back_populates="events",
    )



class ChaosInvariantResult(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chaos_invariant_results"

    experiment_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chaos_experiments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invariant_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expected_condition: Mapped[str] = mapped_column(String(256), nullable=False)
    observed_condition: Mapped[str] = mapped_column(String(256), nullable=False)
    verdict: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    evidence: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    experiment: Mapped["ChaosExperiment"] = relationship("ChaosExperiment", back_populates="invariant_results")
