from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateTransitionError, PaymentConflictError, PaymentNotFoundError
from app.core.state_machine import PaymentStatus, compute_refund_transition, validate_transition
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.processor_attempt import ProcessorAttempt
from app.schemas.payment import AuthorizePaymentRequest, PaymentCreateRequest, PaymentResponse, RefundRequest
from app.services.mock_processor import simulate_authorization_outcome


def _canonicalize_payload(payload: Dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _payment_to_response(payment: Payment) -> Dict[str, Any]:
    return {
        "id": payment.id,
        "payment_id": payment.id,
        "amount": payment.amount,
        "currency": payment.currency,
        "status": payment.status,
        "idempotency_key": payment.idempotency_key,
        "captured_amount": payment.captured_amount,
        "refunded_amount": payment.refunded_amount,
        "client_id": payment.client_id,
        "request_hash": payment.request_hash,
        "created_at": payment.created_at,
        "updated_at": payment.updated_at,
    }


def _get_payment_or_404(db: Session, payment_id: UUID) -> Payment:
    payment = db.query(Payment).filter(Payment.id == payment_id).with_for_update().one_or_none()
    if payment is None:
        raise PaymentNotFoundError(f"Payment {payment_id} was not found.")
    return payment


def _record_event(
    db: Session,
    payment: Payment,
    event_type: str,
    previous_status: Optional[str],
    new_status: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> PaymentEvent:
    event = PaymentEvent(
        payment_id=payment.id,
        event_type=event_type,
        previous_status=previous_status,
        new_status=new_status,
        event_metadata=metadata or {},
    )
    db.add(event)
    return event


def _record_processor_attempt(
    db: Session,
    payment: Payment,
    result: Dict[str, Any],
    stage: str,
) -> ProcessorAttempt:
    attempt = ProcessorAttempt(
        payment_id=payment.id,
        processor_id=result["processor_id"],
        status=result["status"],
        error_code=result.get("error_code"),
    )
    db.add(attempt)
    return attempt


def create_payment(db: Session, request: PaymentCreateRequest) -> Payment:
    payload = {
        "amount": int(request.amount),
        "currency": request.currency,
        "idempotency_key": request.idempotency_key,
        "client_id": request.client_id,
    }
    request_hash = _canonicalize_payload(payload)

    existing = db.query(Payment).filter(Payment.idempotency_key == request.idempotency_key).with_for_update().one_or_none()
    if existing is not None:
        existing_hash = existing.request_hash or _canonicalize_payload({
            "amount": existing.amount,
            "currency": existing.currency,
            "idempotency_key": existing.idempotency_key,
            "client_id": existing.client_id,
        })
        if existing_hash == request_hash:
            return existing
        raise PaymentConflictError(
            message="Idempotency key is already associated with a different request payload.",
            details={"idempotency_key": request.idempotency_key},
        )

    payment = Payment(
        amount=request.amount,
        currency=request.currency,
        status=PaymentStatus.CREATED.value,
        idempotency_key=request.idempotency_key,
        client_id=request.client_id,
        request_hash=request_hash,
    )
    db.add(payment)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.query(Payment).filter(Payment.idempotency_key == request.idempotency_key).with_for_update().one_or_none()
        if existing is not None:
            existing_hash = existing.request_hash or _canonicalize_payload({
                "amount": existing.amount,
                "currency": existing.currency,
                "idempotency_key": existing.idempotency_key,
                "client_id": existing.client_id,
            })
            if existing_hash == request_hash:
                return existing
        raise PaymentConflictError(
            message="A payment with this idempotency key already exists for a different payload.",
            details={"idempotency_key": request.idempotency_key},
        )

    _record_event(
        db,
        payment,
        "PAYMENT_CREATED",
        previous_status=None,
        new_status=PaymentStatus.CREATED.value,
        metadata={
            "amount": payment.amount,
            "currency": payment.currency,
            "idempotency_key": payment.idempotency_key,
            "client_id": payment.client_id,
        },
    )
    db.commit()
    db.refresh(payment)
    return payment


def authorize_payment(db: Session, payment_id: UUID, request: Optional[AuthorizePaymentRequest]) -> Payment:
    payment = _get_payment_or_404(db, payment_id)
    current_status = PaymentStatus(payment.status)
    outcome = simulate_authorization_outcome(str(payment.id), (request.processor_outcome if request else "APPROVED"))
    target_status = PaymentStatus.AUTHORIZED if outcome["outcome"] == "APPROVED" else PaymentStatus.FAILED

    validate_transition(current_status, target_status)
    payment.status = target_status.value
    payment.updated_at = payment.updated_at

    _record_processor_attempt(db, payment, outcome, stage="authorization")
    _record_event(
        db,
        payment,
        event_type="AUTHORIZATION_SUCCEEDED" if target_status == PaymentStatus.AUTHORIZED else "AUTHORIZATION_DECLINED",
        previous_status=current_status.value,
        new_status=target_status.value,
        metadata={
            "processor_id": outcome["processor_id"],
            "processor_status": outcome["status"],
            "error_code": outcome.get("error_code"),
            "decision_code": outcome.get("decision_code"),
        },
    )
    db.commit()
    db.refresh(payment)
    return payment


def capture_payment(db: Session, payment_id: UUID) -> Payment:
    payment = _get_payment_or_404(db, payment_id)
    current_status = PaymentStatus(payment.status)
    validate_transition(current_status, PaymentStatus.CAPTURED)

    if payment.captured_amount > 0:
        raise InvalidStateTransitionError(
            from_state=current_status.value,
            to_state=PaymentStatus.CAPTURED.value,
            details={"error": "Payment has already been captured."},
        )

    payment.captured_amount = payment.amount
    payment.status = PaymentStatus.CAPTURED.value

    _record_event(
        db,
        payment,
        "PAYMENT_CAPTURED",
        previous_status=current_status.value,
        new_status=PaymentStatus.CAPTURED.value,
        metadata={"captured_amount": payment.captured_amount},
    )
    db.commit()
    db.refresh(payment)
    return payment


def cancel_payment(db: Session, payment_id: UUID) -> Payment:
    payment = _get_payment_or_404(db, payment_id)
    current_status = PaymentStatus(payment.status)
    validate_transition(current_status, PaymentStatus.CANCELLED)

    payment.status = PaymentStatus.CANCELLED.value
    _record_event(
        db,
        payment,
        "PAYMENT_CANCELLED",
        previous_status=current_status.value,
        new_status=PaymentStatus.CANCELLED.value,
        metadata={"cancelled_amount": payment.amount},
    )
    db.commit()
    db.refresh(payment)
    return payment


def refund_payment(db: Session, payment_id: UUID, request: RefundRequest) -> Payment:
    payment = _get_payment_or_404(db, payment_id)
    current_status = PaymentStatus(payment.status)
    if request.amount <= 0:
        raise ValueError("Refund amount must be strictly greater than zero minor units.")

    if current_status not in {PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED}:
        raise InvalidStateTransitionError(
            from_state=current_status.value,
            to_state="REFUND_STATE",
            details={"error": "Refunds are only allowed for captured or partially refunded payments."},
        )

    new_total_refunded = payment.refunded_amount + request.amount
    if new_total_refunded > payment.captured_amount:
        raise ValueError("Refund exceeds the captured amount.")

    target_status = compute_refund_transition(
        current_status=current_status,
        captured_amount=payment.captured_amount,
        already_refunded_amount=payment.refunded_amount,
        additional_refund_amount=request.amount,
    )
    validate_transition(current_status, target_status)

    payment.refunded_amount = new_total_refunded
    payment.status = target_status.value
    _record_event(
        db,
        payment,
        "PAYMENT_REFUNDED" if target_status == PaymentStatus.REFUNDED else "PAYMENT_PARTIALLY_REFUNDED",
        previous_status=current_status.value,
        new_status=target_status.value,
        metadata={
            "refund_amount": request.amount,
            "refunded_amount": payment.refunded_amount,
            "captured_amount": payment.captured_amount,
        },
    )
    db.commit()
    db.refresh(payment)
    return payment


def get_payment(db: Session, payment_id: UUID) -> Payment:
    payment = db.query(Payment).filter(Payment.id == payment_id).one_or_none()
    if payment is None:
        raise PaymentNotFoundError(f"Payment {payment_id} was not found.")
    return payment


def list_payments(db: Session, status: Optional[str], limit: int, offset: int) -> Dict[str, Any]:
    query = db.query(Payment)
    if status:
        query = query.filter(Payment.status == status.upper())

    total = query.count()
    items = query.order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [PaymentResponse.model_validate(_payment_to_response(item)) for item in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_payment_events(db: Session, payment_id: UUID) -> List[PaymentEvent]:
    payment = db.query(Payment).filter(Payment.id == payment_id).one_or_none()
    if payment is None:
        raise PaymentNotFoundError(f"Payment {payment_id} was not found.")
    return db.query(PaymentEvent).filter(PaymentEvent.payment_id == payment_id).order_by(PaymentEvent.created_at.asc()).all()


def get_payment_count(db: Session) -> int:
    return db.query(func.count(Payment.id)).scalar() or 0
