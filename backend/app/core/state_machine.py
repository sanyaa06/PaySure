"""
PaySure Payment State Machine Specification.

Defines all valid lifecycle states, valid state transitions, terminal states,
and partial/full refund invariants.
"""

from enum import Enum
from typing import Dict, FrozenSet, Optional, Set
from app.core.errors import InvalidStateTransitionError


class PaymentStatus(str, Enum):
    """
    Exhaustive lifecycle states of a PaySure payment transaction.
    """
    CREATED = "CREATED"
    AUTHORIZED = "AUTHORIZED"
    CAPTURED = "CAPTURED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"
    REFUNDED = "REFUNDED"


# Terminal states: Once entered, no further state transitions are permitted.
TERMINAL_STATES: FrozenSet[PaymentStatus] = frozenset({
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.REFUNDED,
})

# Valid directed transitions map
# Key: source state -> Value: set of allowable target states
VALID_TRANSITIONS: Dict[PaymentStatus, FrozenSet[PaymentStatus]] = {
    PaymentStatus.CREATED: frozenset({
        PaymentStatus.AUTHORIZED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
    }),
    PaymentStatus.AUTHORIZED: frozenset({
        PaymentStatus.CAPTURED,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
    }),
    PaymentStatus.CAPTURED: frozenset({
        PaymentStatus.PARTIALLY_REFUNDED,
        PaymentStatus.REFUNDED,
    }),
    PaymentStatus.PARTIALLY_REFUNDED: frozenset({
        PaymentStatus.PARTIALLY_REFUNDED,
        PaymentStatus.REFUNDED,
    }),
    PaymentStatus.FAILED: frozenset(),
    PaymentStatus.CANCELLED: frozenset(),
    PaymentStatus.REFUNDED: frozenset(),
}


def is_terminal_state(status: PaymentStatus) -> bool:
    """Returns True if the status is a terminal state."""
    return status in TERMINAL_STATES


def can_transition(current_status: PaymentStatus, target_status: PaymentStatus) -> bool:
    """
    Checks whether a transition from current_status to target_status is legally permitted.
    """
    if current_status not in VALID_TRANSITIONS:
        return False
    return target_status in VALID_TRANSITIONS[current_status]


def validate_transition(current_status: PaymentStatus, target_status: PaymentStatus) -> None:
    """
    Validates that a state transition is legal according to the state machine.
    Raises InvalidStateTransitionError if the transition is disallowed.
    """
    if not can_transition(current_status, target_status):
        raise InvalidStateTransitionError(
            from_state=current_status.value,
            to_state=target_status.value,
            details={
                "current_status": current_status.value,
                "target_status": target_status.value,
                "is_terminal": is_terminal_state(current_status),
                "allowed_transitions": [s.value for s in VALID_TRANSITIONS.get(current_status, set())]
            }
        )


def compute_refund_transition(
    current_status: PaymentStatus,
    captured_amount: int,
    already_refunded_amount: int,
    additional_refund_amount: int
) -> PaymentStatus:
    """
    Computes the resulting payment status when applying a refund, enforcing invariant rules:
    - Current state must be CAPTURED or PARTIALLY_REFUNDED.
    - Refund amount must be strictly positive (> 0).
    - Cumulative refund must not exceed captured_amount.
    """
    if current_status not in {PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED}:
        raise InvalidStateTransitionError(
            from_state=current_status.value,
            to_state="REFUND_STATE",
            details={"error": "Cannot refund a payment that has not been captured"}
        )

    if additional_refund_amount <= 0:
        raise ValueError("Refund amount must be strictly greater than zero minor units.")

    new_cumulative_refund = already_refunded_amount + additional_refund_amount
    if new_cumulative_refund > captured_amount:
        raise ValueError(
            f"Cumulative refund ({new_cumulative_refund}) exceeds captured amount ({captured_amount})."
        )

    if new_cumulative_refund == captured_amount:
        return PaymentStatus.REFUNDED
    return PaymentStatus.PARTIALLY_REFUNDED
