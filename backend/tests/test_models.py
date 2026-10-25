import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.state_machine import PaymentStatus
from app.models.chaos import ChaosExperiment
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.processor_attempt import ProcessorAttempt
from app.schemas.chaos import ChaosExperimentResponse
from app.services.chaos_service import execute_experiment, mark_stale_experiments
from app.services.invariant_checker import verify_payment_invariants


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


def test_chaos_experiment_response_accepts_uuid_ids():
    experiment_id = uuid.uuid4()
    model = ChaosExperimentResponse.model_validate({
        "id": experiment_id,
        "scenario_id": "duplicate-payment-request",
        "status": "RUNNING",
        "configuration": {"target_operation": "capture"},
        "related_payment_ids": [],
    })

    assert model.id == experiment_id
    assert str(model.id) == str(experiment_id)


def test_chaos_experiment_completes_with_terminal_status(db_session: Session):
    experiment = execute_experiment(
        db_session,
        {
            "scenario_id": "duplicate-payment-request",
            "target_operation": "capture",
            "delay_ms": 0,
            "repetition_count": 2,
            "concurrency_level": 2,
            "maximum_attempts": 3,
            "random_seed": 42,
        },
    )

    assert experiment.status in {"COMPLETED", "FAILED"}
    assert experiment.final_verdict is not None
    assert experiment.completed_at is not None


def test_initial_payment_created_event_is_valid_transition(db_session: Session):
    payment = Payment(
        amount=4500,
        currency="USD",
        status="CREATED",
        idempotency_key=f"initial_event_{uuid.uuid4()}",
    )
    db_session.add(payment)
    db_session.commit()

    event = PaymentEvent(
        payment_id=payment.id,
        event_type="PAYMENT_CREATED",
        previous_status=None,
        new_status="CREATED",
        event_metadata={"amount": payment.amount},
    )
    db_session.add(event)
    db_session.commit()

    results = verify_payment_invariants(db_session, [payment.id])
    transition_results = [result for result in results if result["invariant_name"] == "VALID_STATE_TRANSITIONS"]

    assert transition_results
    assert transition_results[0]["verdict"] == "PASS"


def test_chaos_experiment_failure_marks_failed_state(db_session: Session, monkeypatch: pytest.MonkeyPatch):
    def raise_runtime_error(*args, **kwargs):
        raise RuntimeError("simulated invariant failure")

    monkeypatch.setattr("app.services.chaos_service.verify_payment_invariants", raise_runtime_error)

    with pytest.raises(RuntimeError, match="simulated invariant failure"):
        execute_experiment(
            db_session,
            {
                "scenario_id": "duplicate-payment-request",
                "target_operation": "capture",
                "delay_ms": 0,
                "repetition_count": 2,
                "concurrency_level": 2,
                "maximum_attempts": 3,
                "random_seed": 42,
            },
        )

    stale = db_session.query(ChaosExperiment).filter(ChaosExperiment.status == "FAILED").order_by(ChaosExperiment.started_at.desc()).first()
    assert stale is not None
    assert stale.error_summary == "simulated invariant failure"


def test_mark_stale_experiments_recovers_running_rows(db_session: Session):
    old_start = datetime.now(timezone.utc).replace(year=2000)
    stale = ChaosExperiment(
        scenario_id="duplicate-payment-request",
        status="RUNNING",
        configuration={"scenario_id": "duplicate-payment-request"},
        started_at=old_start,
        final_verdict=None,
        related_payment_ids=[],
    )
    db_session.add(stale)
    db_session.flush()

    updated = mark_stale_experiments(db_session, stale_after_seconds=60)

    assert updated == 1
    assert stale.status == "FAILED"
    assert stale.final_verdict == "FAILED"
    assert stale.completed_at is not None
    assert "stale" in (stale.error_summary or "").lower()


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
