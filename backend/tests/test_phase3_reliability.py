from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.errors import PaymentConflictError
from app.core.state_machine import PaymentStatus
from app.services.payment_service import create_payment, capture_payment, refund_payment
from app.services.retry_utils import RetryPolicy, classify_retryable_failure, execute_with_retry
from app.schemas.payment import PaymentCreateRequest, RefundRequest


def test_duplicate_payment_create_same_key_same_payload_is_idempotent(db_session):
    payload = PaymentCreateRequest(
        amount=1500,
        currency="USD",
        idempotency_key="phase3-create-dup",
        client_id="client-a",
    )

    first = create_payment(db_session, payload)
    second = create_payment(db_session, payload)

    assert first.id == second.id
    assert first.status == PaymentStatus.CREATED.value
    assert first.idempotency_key == payload.idempotency_key


def test_conflicting_idempotency_key_rejected(db_session):
    first = PaymentCreateRequest(
        amount=2000,
        currency="USD",
        idempotency_key="phase3-conflict",
        client_id="client-a",
    )
    second = PaymentCreateRequest(
        amount=3000,
        currency="USD",
        idempotency_key="phase3-conflict",
        client_id="client-a",
    )

    create_payment(db_session, first)

    with pytest.raises(PaymentConflictError):
        create_payment(db_session, second)


def test_duplicate_capture_is_rejected_idempotently(db_session):
    payload = PaymentCreateRequest(
        amount=5000,
        currency="USD",
        idempotency_key="phase3-capture-dup",
        client_id="client-a",
    )
    payment = create_payment(db_session, payload)

    payment.status = PaymentStatus.AUTHORIZED.value
    payment.captured_amount = 0
    db_session.flush()

    first = capture_payment(db_session, payment.id)
    second = capture_payment(db_session, payment.id)

    assert first.id == second.id
    assert first.status == PaymentStatus.CAPTURED.value
    assert first.captured_amount == 5000


def test_duplicate_refund_is_rejected_idempotently(db_session):
    payload = PaymentCreateRequest(
        amount=10000,
        currency="USD",
        idempotency_key="phase3-refund-dup",
        client_id="client-a",
    )
    payment = create_payment(db_session, payload)
    payment.status = PaymentStatus.CAPTURED.value
    payment.captured_amount = 10000
    payment.refunded_amount = 0
    db_session.flush()

    first = refund_payment(db_session, payment.id, RefundRequest(amount=4000, idempotency_key="refund-dup"))
    second = refund_payment(db_session, payment.id, RefundRequest(amount=4000, idempotency_key="refund-dup"))

    assert first.id == second.id
    assert first.status == PaymentStatus.PARTIALLY_REFUNDED.value
    assert first.refunded_amount == 4000


def test_retry_policy_classifies_failures():
    policy = RetryPolicy(max_attempts=3, base_delay_seconds=0.1, max_delay_seconds=0.5, jitter_ratio=0.0)

    assert classify_retryable_failure("timeout") is True
    assert classify_retryable_failure("temporary outage") is True
    assert classify_retryable_failure("validation error") is False

    calls = {"count": 0}

    def flaky_operation():
        calls["count"] += 1
        if calls["count"] < 3:
            raise TimeoutError("transient timeout")
        return "ok"

    result = execute_with_retry(flaky_operation, policy=policy)
    assert result == "ok"
    assert calls["count"] == 3
