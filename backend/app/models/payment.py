import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import BigInteger, CheckConstraint, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.core.state_machine import PaymentStatus

if TYPE_CHECKING:
    from app.models.payment_event import PaymentEvent
    from app.models.processor_attempt import ProcessorAttempt


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Core Payment transaction model.
    Stores immutable financial attributes (amount in integer minor units, currency)
    and current lifecycle status.

    Note on PCI DSS Compliance:
    Actual card numbers, CVVs, and magnetic stripe data are strictly prohibited.
    Only simulated processor identifiers and synthetic payment tokens are managed.
    """
    __tablename__ = "payments"

    def __init__(self, **kwargs):
        created_at = kwargs.get("created_at")
        if created_at is not None and "updated_at" not in kwargs:
            kwargs["updated_at"] = created_at
        super().__init__(**kwargs)

    # Financial details in integer minor units (e.g., 1000 cents = $10.00 USD)
    amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="Total authorization amount in integer minor units (e.g. cents)"
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        comment="ISO 4217 three-letter currency code (e.g. USD, EUR, GBP)"
    )

    # Current lifecycle state
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=PaymentStatus.CREATED.value,
        index=True,
        comment="Current lifecycle status according to the payment state machine"
    )

    # Scoped Idempotency Key
    # In multi-tenant environments, this is scoped per merchant/client.
    # Indexed for rapid lookup during duplicate detection.
    idempotency_key: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
        comment="Unique client-provided idempotency key preventing double charges"
    )

    # Cumulative captured & refunded amounts (in minor units)
    captured_amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        comment="Total settled/captured amount in minor units"
    )

    refunded_amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        comment="Cumulative refunded amount in minor units"
    )

    # Client/merchant identifier for future multi-tenant partitioning
    client_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        index=True,
        comment="Identifier of the calling client or merchant organization"
    )

    # Request fingerprint hash for payload integrity validation in later phases
    request_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="SHA-256 fingerprint of the initial authorization payload"
    )

    # ORM Relationships
    events: Mapped[List["PaymentEvent"]] = relationship(
        "PaymentEvent",
        back_populates="payment",
        cascade="all, delete-orphan",
        order_by="PaymentEvent.created_at.asc()"
    )

    attempts: Mapped[List["ProcessorAttempt"]] = relationship(
        "ProcessorAttempt",
        back_populates="payment",
        cascade="all, delete-orphan",
        order_by="ProcessorAttempt.started_at.asc()"
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_payment_amount_positive"),
        CheckConstraint("captured_amount >= 0", name="chk_payment_captured_amount_non_negative"),
        CheckConstraint("refunded_amount >= 0", name="chk_payment_refunded_amount_non_negative"),
        CheckConstraint("refunded_amount <= captured_amount", name="chk_payment_refund_le_captured"),
        CheckConstraint("length(currency) = 3", name="chk_payment_currency_length"),
        Index("ix_payments_client_created", "client_id", "created_at"),
        Index("ix_payments_status_created", "status", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Payment {self.id} {self.amount} {self.currency} status={self.status}>"
