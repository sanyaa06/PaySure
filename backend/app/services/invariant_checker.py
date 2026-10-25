from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.core.state_machine import PaymentStatus, validate_transition
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent


def _normalize_verdict(value: str) -> str:
    return value.upper().strip()


def verify_payment_invariants(db: Session, payment_ids: List[Any]) -> List[Dict[str, Any]]:
    """Checks persisted payment records against the core financial invariants."""

    results: List[Dict[str, Any]] = []
    if not payment_ids:
        return [
            {
                "invariant_name": "NO_PAYMENTS_TO_CHECK",
                "expected_condition": "At least one payment must be present for verification.",
                "observed_condition": "No payments were created for this experiment.",
                "verdict": "NOT_VERIFIED",
                "evidence": {"payment_ids": []},
            }
        ]

    payments = db.query(Payment).filter(Payment.id.in_([str(payment_id) for payment_id in payment_ids])).all()
    if not payments:
        results.append(
            {
                "invariant_name": "PAYMENT_EXISTS",
                "expected_condition": "Experiment-related payments should exist in storage.",
                "observed_condition": "No related payment rows were found.",
                "verdict": "FAIL",
                "evidence": {"payment_ids": payment_ids},
            }
        )
        return results

    for payment in payments:
        payment_status = PaymentStatus(payment.status)
        expected = {
            "captured_amount": payment.captured_amount >= 0,
            "refunded_amount": payment.refunded_amount >= 0,
            "refund_limit": payment.refunded_amount <= payment.captured_amount,
            "status_valid": payment_status in list(PaymentStatus),
        }

        observed = {
            "captured_amount": payment.captured_amount,
            "refunded_amount": payment.refunded_amount,
            "status": payment.status,
            "amount": payment.amount,
        }

        if not all(expected.values()):
            verdict = "FAIL"
        else:
            verdict = "PASS"

        results.append(
            {
                "invariant_name": "MONETARY_INTEGRITY",
                "expected_condition": "Captured and refunded amounts stay non-negative and refund totals do not exceed captured totals.",
                "observed_condition": str(observed),
                "verdict": _normalize_verdict(verdict),
                "evidence": {"payment_id": str(payment.id), "details": observed},
            }
        )

        events = db.query(PaymentEvent).filter(PaymentEvent.payment_id == payment.id).order_by(PaymentEvent.created_at.asc()).all()
        if not events:
            results.append(
                {
                    "invariant_name": "AUDIT_CONSISTENCY",
                    "expected_condition": "At least one audit event should exist for a payment lifecycle.",
                    "observed_condition": "No audit history was found for the payment.",
                    "verdict": "FAIL",
                    "evidence": {"payment_id": str(payment.id)},
                }
            )
            continue

        last_event = events[-1]
        transition_ok = True
        try:
            validate_transition(PaymentStatus(last_event.previous_status) if last_event.previous_status else PaymentStatus.CREATED, PaymentStatus(last_event.new_status))
        except Exception:
            transition_ok = False

        results.append(
            {
                "invariant_name": "VALID_STATE_TRANSITIONS",
                "expected_condition": "Committed state transitions should follow the payment state machine.",
                "observed_condition": "Observed last event status transition is valid" if transition_ok else "Observed last event state transition violates the allowed lifecycle.",
                "verdict": "PASS" if transition_ok else "FAIL",
                "evidence": {
                    "payment_id": str(payment.id),
                    "last_event_type": last_event.event_type,
                    "previous_status": last_event.previous_status,
                    "new_status": last_event.new_status,
                },
            }
        )

    return results
