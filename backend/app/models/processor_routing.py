from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import BigInteger, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class ProcessorRoutingDecision(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "processor_routing_decisions"

    payment_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payments.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    logical_operation_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
    )
    processor_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    routing_policy: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
    )
    selection_reason: Mapped[str] = mapped_column(
        String(256),
        nullable=False,
    )
    observed_processor_health: Mapped[str] = mapped_column(
        String(32),
        nullable=True,
        default="UNKNOWN",
    )
    estimated_latency_ms: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
    )
    outcome: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
    )
    actual_latency_ms: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<ProcessorRoutingDecision {self.id} processor={self.processor_id} policy={self.routing_policy}>"
