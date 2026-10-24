import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional
from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.base import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.payment import Payment


class PaymentEvent(Base, UUIDPrimaryKeyMixin):
    """
    Immutable audit ledger of all lifecycle events and state transitions
    occurring on a Payment record.
    """
    __tablename__ = "payment_events"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Foreign key reference to the parent payment"
    )

    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Type of event (e.g., PAYMENT_CREATED, AUTHORIZATION_SUCCEEDED, CAPTURE_SUCCEEDED, REFUND_ISSUED)"
    )

    previous_status: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        comment="Previous lifecycle status before this event"
    )

    new_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="Lifecycle status resulting from this event"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
        comment="Timezone-aware timestamp when this event occurred"
    )

    # Contextual metadata (e.g., gateway response code, trigger reason, actor, refund amount)
    event_metadata: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="Arbitrary contextual payload for debugging and audit reconstruction"
    )

    # ORM relationship
    payment: Mapped["Payment"] = relationship(
        "Payment",
        back_populates="events"
    )

    __table_args__ = (
        Index("ix_payment_events_pid_created", "payment_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<PaymentEvent {self.id} payment_id={self.payment_id} event={self.event_type} {self.previous_status}->{self.new_status}>"
