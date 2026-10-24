import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.state_machine import PaymentStatus
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.processor_attempt import ProcessorAttempt


def test_create_payment_model(db_session: Session):
    payment = Payment(
        amount=5000,  # $50.00 in minor units
        currency="USD",
        status=PaymentStatus.CREATED.value,
        idempotency_key=f"idem_{uuid.uuid4()}",
        client_id="merchant_visa_demo",
    )
    db_session.add(payment)
    db_session.commit()
    db_session.refresh(payment)

    assert isinstance(payment.id, uuid.UUID)
    assert payment.amount == 5000
    assert payment.currency == "USD"
    assert payment.status == "CREATED"
    assert payment.captured_amount == 0
    assert payment.refunded_amount == 0
    assert payment.created_at is not None
    assert payment.updated_at is not None


def test_payment_idempotency_uniqueness(db_session: Session):
    key = f"dup_key_{uuid.uuid4()}"
    p1 = Payment(amount=1000, currency="USD", status="CREATED", idempotency_key=key)
    p2 = Payment(amount=2000, currency="USD", status="CREATED", idempotency_key=key)
    db_session.add(p1)
    db_session.commit()

    db_session.add(p2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_payment_event_audit_link(db_session: Session):
    payment = Payment(
        amount=15000,
        currency="EUR",
        status=PaymentStatus.CREATED.value,
        idempotency_key=f"event_key_{uuid.uuid4()}",
    )
    db_session.add(payment)
    db_session.commit()

    event = PaymentEvent(
        payment_id=payment.id,
        event_type="PAYMENT_CREATED",
        previous_status=None,
        new_status="CREATED",
        event_metadata={"initiated_by": "api_client_test", "channel": "rest_v1"},
    )
    db_session.add(event)
    db_session.commit()

    db_session.refresh(payment)
    assert len(payment.events) == 1
    assert payment.events[0].event_type == "PAYMENT_CREATED"
    assert payment.events[0].event_metadata["channel"] == "rest_v1"


def test_processor_attempt_link(db_session: Session):
    payment = Payment(
        amount=7500,
        currency="GBP",
        status=PaymentStatus.CREATED.value,
        idempotency_key=f"proc_key_{uuid.uuid4()}",
    )
    db_session.add(payment)
    db_session.commit()

    attempt = ProcessorAttempt(
        payment_id=payment.id,
        processor_id="visa_sim_alpha",
        status="PENDING",
        error_code=None,
    )
    db_session.add(attempt)
    db_session.commit()

    db_session.refresh(payment)
    assert len(payment.attempts) == 1
    assert payment.attempts[0].processor_id == "visa_sim_alpha"
    assert payment.attempts[0].status == "PENDING"


def test_cascade_deletion(db_session: Session):
    payment = Payment(
        amount=1000,
        currency="USD",
        status="CREATED",
        idempotency_key=f"cascade_key_{uuid.uuid4()}",
    )
    db_session.add(payment)
    db_session.commit()

    event = PaymentEvent(
        payment_id=payment.id,
        event_type="PAYMENT_CREATED",
        previous_status=None,
        new_status="CREATED",
    )
    attempt = ProcessorAttempt(
        payment_id=payment.id,
        processor_id="visa_sim_alpha",
        status="PENDING",
    )
    db_session.add(event)
    db_session.add(attempt)
    db_session.commit()

    # Delete payment
    db_session.delete(payment)
    db_session.commit()

    # Associated records must be cascaded
    assert db_session.query(PaymentEvent).filter_by(payment_id=payment.id).first() is None
    assert db_session.query(ProcessorAttempt).filter_by(payment_id=payment.id).first() is None
