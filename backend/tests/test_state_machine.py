import pytest
from app.core.errors import InvalidStateTransitionError
from app.core.state_machine import (
    TERMINAL_STATES,
    PaymentStatus,
    can_transition,
    compute_refund_transition,
    is_terminal_state,
    validate_transition,
)


def test_valid_transitions_from_created():
    assert can_transition(PaymentStatus.CREATED, PaymentStatus.AUTHORIZED) is True
    assert can_transition(PaymentStatus.CREATED, PaymentStatus.FAILED) is True
    assert can_transition(PaymentStatus.CREATED, PaymentStatus.CANCELLED) is True
    # Validation helper should pass without exception
    validate_transition(PaymentStatus.CREATED, PaymentStatus.AUTHORIZED)


def test_valid_transitions_from_authorized():
    assert can_transition(PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED) is True
    assert can_transition(PaymentStatus.AUTHORIZED, PaymentStatus.CANCELLED) is True
    assert can_transition(PaymentStatus.AUTHORIZED, PaymentStatus.FAILED) is True


def test_valid_transitions_from_captured():
    assert can_transition(PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED) is True
    assert can_transition(PaymentStatus.CAPTURED, PaymentStatus.REFUNDED) is True


def test_valid_transitions_from_partially_refunded():
    assert can_transition(PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.PARTIALLY_REFUNDED) is True
    assert can_transition(PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED) is True


def test_terminal_states_cannot_transition():
    for terminal in TERMINAL_STATES:
        assert is_terminal_state(terminal) is True
        for target in PaymentStatus:
            assert can_transition(terminal, target) is False
            with pytest.raises(InvalidStateTransitionError):
                validate_transition(terminal, target)


def test_illegal_lifecycle_jumps_rejected():
    illegal_pairs = [
        (PaymentStatus.CREATED, PaymentStatus.CAPTURED),
        (PaymentStatus.CREATED, PaymentStatus.REFUNDED),
        (PaymentStatus.AUTHORIZED, PaymentStatus.REFUNDED),
        (PaymentStatus.CAPTURED, PaymentStatus.AUTHORIZED),
        (PaymentStatus.CAPTURED, PaymentStatus.CREATED),
        (PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.CAPTURED),
    ]
    for source, target in illegal_pairs:
        assert can_transition(source, target) is False
        with pytest.raises(InvalidStateTransitionError):
            validate_transition(source, target)


def test_compute_refund_transition_full():
    status = compute_refund_transition(
        current_status=PaymentStatus.CAPTURED,
        captured_amount=10000,
        already_refunded_amount=0,
        additional_refund_amount=10000,
    )
    assert status == PaymentStatus.REFUNDED


def test_compute_refund_transition_partial():
    status = compute_refund_transition(
        current_status=PaymentStatus.CAPTURED,
        captured_amount=10000,
        already_refunded_amount=0,
        additional_refund_amount=4000,
    )
    assert status == PaymentStatus.PARTIALLY_REFUNDED


def test_compute_refund_transition_subsequent_to_full():
    status = compute_refund_transition(
        current_status=PaymentStatus.PARTIALLY_REFUNDED,
        captured_amount=10000,
        already_refunded_amount=4000,
        additional_refund_amount=6000,
    )
    assert status == PaymentStatus.REFUNDED


def test_compute_refund_excess_rejection():
    with pytest.raises(ValueError, match="exceeds captured amount"):
        compute_refund_transition(
            current_status=PaymentStatus.CAPTURED,
            captured_amount=10000,
            already_refunded_amount=5000,
            additional_refund_amount=6000,
        )


def test_compute_refund_non_positive_rejection():
    with pytest.raises(ValueError, match="strictly greater than zero"):
        compute_refund_transition(
            current_status=PaymentStatus.CAPTURED,
            captured_amount=10000,
            already_refunded_amount=0,
            additional_refund_amount=0,
        )


def test_compute_refund_uncaptured_rejection():
    with pytest.raises(InvalidStateTransitionError):
        compute_refund_transition(
            current_status=PaymentStatus.CREATED,
            captured_amount=10000,
            already_refunded_amount=0,
            additional_refund_amount=1000,
        )
