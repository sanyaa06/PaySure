from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.payment import (
    AuthorizePaymentRequest,
    PaymentCreateRequest,
    PaymentCreateResponse,
    PaymentEventResponse,
    PaymentListResponse,
    PaymentResponse,
    RefundRequest,
)
from app.services import payment_service

router = APIRouter(prefix="/payments")


@router.post(
    "",
    response_model=PaymentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new synthetic payment",
    description="Creates a payment entry and records the initial PAYMENT_CREATED audit event.",
)
def create_payment(request: PaymentCreateRequest, db: Session = Depends(get_db)):
    payment = payment_service.create_payment(db, request)
    payload = payment_service._payment_to_response(payment)
    return PaymentCreateResponse.model_validate(payload)


@router.post(
    "/{payment_id}/authorize",
    response_model=PaymentResponse,
    summary="Authorize a payment",
    description="Simulates a deterministic processor authorization and transitions the payment state.",
)
def authorize_payment(
    payment_id: UUID,
    request: Optional[AuthorizePaymentRequest] = None,
    db: Session = Depends(get_db),
):
    payment = payment_service.authorize_payment(db, payment_id, request)
    return PaymentResponse.model_validate(payment_service._payment_to_response(payment))


@router.post(
    "/{payment_id}/capture",
    response_model=PaymentResponse,
    summary="Capture an authorized payment",
    description="Captures the full amount for an AUTHORIZED payment and records the PAYMENT_CAPTURED event.",
)
def capture_payment(payment_id: UUID, db: Session = Depends(get_db)):
    payment = payment_service.get_payment(db, payment_id)
    if payment.status == "CAPTURED" and payment.captured_amount >= payment.amount:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment has already been captured.",
        )
    payment = payment_service.capture_payment(db, payment_id)
    return PaymentResponse.model_validate(payment_service._payment_to_response(payment))


@router.post(
    "/{payment_id}/cancel",
    response_model=PaymentResponse,
    summary="Cancel an eligible payment",
    description="Transitions a valid payment to CANCELLED and records a payment cancellation event.",
)
def cancel_payment(payment_id: UUID, db: Session = Depends(get_db)):
    payment = payment_service.cancel_payment(db, payment_id)
    return PaymentResponse.model_validate(payment_service._payment_to_response(payment))


@router.post(
    "/{payment_id}/refund",
    response_model=PaymentResponse,
    summary="Process a partial or full refund",
    description="Applies a refund against the captured amount while maintaining state invariants.",
)
def refund_payment(payment_id: UUID, request: RefundRequest, db: Session = Depends(get_db)):
    payment = payment_service.get_payment(db, payment_id)
    if payment.status in {"PARTIALLY_REFUNDED", "REFUNDED"} and payment.refunded_amount >= request.amount:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This refund amount has already been processed for the payment.",
        )
    payment = payment_service.refund_payment(db, payment_id, request)
    return PaymentResponse.model_validate(payment_service._payment_to_response(payment))


@router.get(
    "",
    response_model=PaymentListResponse,
    summary="List payments",
    description="Returns a paginated summary of payment records filtered by status when provided.",
)
def list_payments(
    status: Optional[str] = Query(default=None, description="Optional status filter"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    result = payment_service.list_payments(db, status=status, limit=limit, offset=offset)
    return PaymentListResponse(**result)


@router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
    summary="Get a payment by id",
    description="Returns the full payment record for a given payment identifier.",
)
def get_payment(payment_id: UUID, db: Session = Depends(get_db)):
    payment = payment_service.get_payment(db, payment_id)
    return PaymentResponse.model_validate(payment_service._payment_to_response(payment))


@router.get(
    "/{payment_id}/events",
    response_model=list[PaymentEventResponse],
    summary="Get payment audit history",
    description="Returns the ordered audit event list for a payment in chronological order.",
)
def get_payment_events(payment_id: UUID, db: Session = Depends(get_db)):
    events = payment_service.get_payment_events(db, payment_id)
    return [PaymentEventResponse.model_validate(event) for event in events]
