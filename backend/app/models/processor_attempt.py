import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.base import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.payment import Payment


class ProcessorAttempt(Base, UUIDPrimaryKeyMixin):
    """
    Records an individual interaction attempt with an external payment gateway / processor.
    Essential for tracing retries, fallback routing, processor timeouts, and circuit breaking.
    """
    __tablename__ = "processor_attempts"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Foreign key reference to parent payment"
    )

    processor_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Identifier of targeted processor (e.g. processor_primary, processor_secondary)"
    )

    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="PENDING",
        index=True,
        comment="Outcome status: PENDING, SUCCESS, FAILED, TIMEOUT, UNKNOWN"
    )

    error_code: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="Downstream processor error or rejection code (e.g. CARD_DECLINED, READ_TIMEOUT)"
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
        comment="Timezone-aware timestamp when the HTTP/network attempt commenced"
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timezone-aware timestamp when downstream ACK or timeout occurred"
    )

    # ORM relationship
    payment: Mapped["Payment"] = relationship(
        "Payment",
        back_populates="attempts"
    )

    __table_args__ = (
        Index("ix_proc_attempts_pid_started", "payment_id", "started_at"),
        Index("ix_proc_attempts_proc_status", "processor_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<ProcessorAttempt {self.id} processor={self.processor_id} status={self.status}>"
