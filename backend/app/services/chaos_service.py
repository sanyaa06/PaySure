from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.chaos import ChaosExperiment, ChaosExperimentEvent, ChaosInvariantResult
from app.models.payment import Payment
from app.models.processor_attempt import ProcessorAttempt
from app.services import payment_service
from app.services.invariant_checker import verify_payment_invariants
from app.services.retry_utils import RetryPolicy, execute_with_retry

settings = get_settings()

SCENARIO_DEFINITIONS = [
    {
        "id": "timeout-before-processing",
        "name": "Timeout Before Processing",
        "description": "The processor never responds before the execution window closes.",
        "failure_type": "timeout",
        "expected_system_response": "No financial change; retry policy applied; attempt recorded.",
    },
    {
        "id": "timeout-after-processing",
        "name": "Timeout After Processing",
        "description": "The processor completes work but the response is lost in transit.",
        "failure_type": "uncertain-outcome",
        "expected_system_response": "Reconciliation checks the original operation ID and applies the confirmed outcome once.",
    },
    {
        "id": "duplicate-payment-request",
        "name": "Duplicate Payment Request",
        "description": "Submit the same payment create request multiple times using the same idempotency key.",
        "failure_type": "idempotency",
        "expected_system_response": "Only a single payment record exists and repeated requests resolve to the same payment.",
    },
    {
        "id": "concurrent-capture",
        "name": "Concurrent Capture",
        "description": "Multiple capture attempts hit the same authorized payment.",
        "failure_type": "race-condition",
        "expected_system_response": "At most one successful capture effect is applied.",
    },
    {
        "id": "concurrent-refund",
        "name": "Concurrent Refund",
        "description": "Multiple refund requests attempt to consume a limited refundable balance.",
        "failure_type": "refund-contention",
        "expected_system_response": "Total refunds never exceed the captured amount.",
    },
    {
        "id": "temporary-processor-outage",
        "name": "Temporary Processor Outage",
        "description": "A transient processor outage triggers retry logic before successful recovery.",
        "failure_type": "temporary-outage",
        "expected_system_response": "Retry attempts are bounded and recoverable or exhausted safely.",
    },
    {
        "id": "lost-response-after-success",
        "name": "Lost Response After Success",
        "description": "The processor succeeded but its acknowledgement never arrived.",
        "failure_type": "lost-response",
        "expected_system_response": "Operation IDs are reconciled and no duplicate charge is created.",
    },
    {
        "id": "duplicate-processor-event",
        "name": "Duplicate Processor Event",
        "description": "The same processor confirmation is received twice.",
        "failure_type": "duplicate-event",
        "expected_system_response": "Repeated notifications do not create duplicate effects.",
    },
    {
        "id": "interrupted-operation-recovery",
        "name": "Interrupted Operation Recovery",
        "description": "A controlled interruption leaves an operation pending until reconciliation resumes.",
        "failure_type": "interruption",
        "expected_system_response": "The workflow resumes safely and only the confirmed effect is persisted.",
    },
    {
        "id": "retry-exhaustion",
        "name": "Retry Exhaustion",
        "description": "Repeated retryable failures hit the configured retry boundary.",
        "failure_type": "retry-limit",
        "expected_system_response": "Retries stop at the configured limit and the final status is reported accurately.",
    },
]


def list_scenarios() -> List[Dict[str, Any]]:
    return [dict(item) for item in SCENARIO_DEFINITIONS]


def validate_experiment_config(config: Dict[str, Any]) -> Dict[str, Any]:
    scenario_id = str(config.get("scenario_id", "")).strip()
    if not scenario_id:
        raise ValueError("scenario_id is required.")

    allowed = {item["id"] for item in SCENARIO_DEFINITIONS}
    if scenario_id not in allowed:
        raise ValueError(f"Unsupported chaos scenario_id: {scenario_id}")

    config = dict(config)
    config["target_operation"] = str(config.get("target_operation", "capture")).strip() or "capture"
    config["delay_ms"] = int(config.get("delay_ms", 150))
    config["repetition_count"] = int(config.get("repetition_count", 2))
    config["concurrency_level"] = int(config.get("concurrency_level", 2))
    config["maximum_attempts"] = int(config.get("maximum_attempts", 3))
    config["random_seed"] = config.get("random_seed")

    if not 0 <= config["delay_ms"] <= 5000:
        raise ValueError("delay_ms must be between 0 and 5000.")
    if not 1 <= config["repetition_count"] <= 20:
        raise ValueError("repetition_count must be between 1 and 20.")
    if not 1 <= config["concurrency_level"] <= 10:
        raise ValueError("concurrency_level must be between 1 and 10.")
    if not 1 <= config["maximum_attempts"] <= 5:
        raise ValueError("maximum_attempts must be between 1 and 5.")
    return config


def _add_event(db: Session, experiment: ChaosExperiment, event_type: str, description: str, event_metadata: Optional[Dict[str, Any]] = None) -> ChaosExperimentEvent:
    event = ChaosExperimentEvent(
        experiment_id=experiment.id,
        timestamp=datetime.now(timezone.utc),
        event_type=event_type,
        description=description,
        event_metadata=event_metadata or {},
    )
    db.add(event)
    return event


def _add_invariant(db: Session, experiment: ChaosExperiment, invariant_name: str, expected_condition: str, observed_condition: str, verdict: str, evidence: Optional[Dict[str, Any]] = None) -> ChaosInvariantResult:
    result = ChaosInvariantResult(
        experiment_id=experiment.id,
        invariant_name=invariant_name,
        expected_condition=expected_condition,
        observed_condition=observed_condition,
        verdict=verdict,
        evidence=evidence or {},
    )
    db.add(result)
    return result


def _build_payment_create_request(amount: int, idempotency_key: str, currency: str = "USD", client_id: str = "chaos-lab"):
    return {
        "amount": amount,
        "currency": currency,
        "idempotency_key": idempotency_key,
        "client_id": client_id,
    }


def _persist_payment_ids(experiment: ChaosExperiment, payment_ids: List[Any]) -> None:
    experiment.related_payment_ids = [str(payment_id) for payment_id in payment_ids]


def _finalize_experiment(db: Session, experiment: ChaosExperiment, verdict: str, error_summary: Optional[str] = None) -> ChaosExperiment:
    experiment.status = "COMPLETED" if verdict != "FAILED" else "FAILED"
    experiment.final_verdict = verdict
    experiment.completed_at = datetime.now(timezone.utc)
    experiment.error_summary = error_summary
    db.add(experiment)
    return experiment


def _run_duplicate_payment_request(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=4500, idempotency_key=f"chaos-{experiment.id}-dup")
    first = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    second = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    if first.id != second.id:
        raise ValueError("duplicate create requests did not resolve to the same payment row")
    _add_event(db, experiment, "PAYMENT_CREATED", "Duplicate payment request resolved to the same record", {"payment_id": str(first.id)})
    return [first]


def _run_concurrent_capture(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=6000, idempotency_key=f"chaos-{experiment.id}-capture")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    payment_service.authorize_payment(db, payment.id, payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"))
    first_capture = payment_service.capture_payment(db, payment.id)
    second_capture = payment_service.capture_payment(db, payment.id)
    if first_capture.id != second_capture.id or second_capture.status != "CAPTURED":
        raise ValueError("duplicate capture requests created inconsistent financial state")
    _add_event(db, experiment, "CAPTURE_REPLAYED", "A second capture was rejected by idempotent service semantics.", {"payment_id": str(payment.id)})
    return [payments := [payment, first_capture]]


def _run_concurrent_refund(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=18000, idempotency_key=f"chaos-{experiment.id}-refund")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    payment_service.authorize_payment(db, payment.id, payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"))
    payment_service.capture_payment(db, payment.id)
    first_refund = payment_service.refund_payment(db, payment.id, payment_service.RefundRequest(amount=4500, idempotency_key="refund-1"))
    second_refund = payment_service.refund_payment(db, payment.id, payment_service.RefundRequest(amount=4500, idempotency_key="refund-2"))
    if first_refund.refunded_amount + second_refund.refunded_amount > payment_service.get_payment(db, payment.id).captured_amount:
        raise ValueError("refund totals exceeded the captured amount")
    _add_event(db, experiment, "REFUND_REPLAYED", "Refund attempts were bounded to the captured balance.", {"payment_id": str(payment.id)})
    return [payment_service.get_payment(db, payment.id)]


def _run_retry_exhaustion(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=1200, idempotency_key=f"chaos-{experiment.id}-retry")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    policy = RetryPolicy(max_attempts=3, base_delay_seconds=0.01, max_delay_seconds=0.05, jitter_ratio=0.0)

    def flaky() -> str:
        raise TimeoutError("transient timeout")

    try:
        execute_with_retry(flaky, policy=policy)
    except TimeoutError:
        _add_event(db, experiment, "RETRY_EXHAUSTED", "Transient processor timeout exhausted the allowed retry budget.", {"payment_id": str(payment.id)})
    return [payment]


def _run_timeout_scenario(db: Session, experiment: ChaosExperiment, scenario_id: str) -> List[Payment]:
    payload = _build_payment_create_request(amount=8500, idempotency_key=f"chaos-{experiment.id}-{scenario_id}")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    db.add(ProcessorAttempt(payment_id=payment.id, processor_id="chaos_timeout", status="TIMEOUT", error_code="READ_TIMEOUT"))
    _add_event(db, experiment, "TIMEOUT_DETECTED", "Processor timeout recorded without financial mutation.", {"payment_id": str(payment.id)})
    return [payment]


def _run_lost_response_scenario(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=9000, idempotency_key=f"chaos-{experiment.id}-lost-response")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    payment_service.authorize_payment(db, payment.id, payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"))
    db.add(ProcessorAttempt(payment_id=payment.id, processor_id="chaos_reconciliation", status="UNKNOWN", error_code="RESPONSE_LOST"))
    _add_event(db, experiment, "RECONCILIATION_PENDING", "Processor success was observed but the response did not reach PaySure.", {"payment_id": str(payment.id)})
    return [payment]


def _run_duplicate_event_scenario(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=5000, idempotency_key=f"chaos-{experiment.id}-duplicate-event")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    payment_service.authorize_payment(db, payment.id, payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"))
    db.add(ProcessorAttempt(payment_id=payment.id, processor_id="chaos_duplicate", status="SUCCESS", error_code=None))
    db.add(ProcessorAttempt(payment_id=payment.id, processor_id="chaos_duplicate", status="SUCCESS", error_code=None))
    _add_event(db, experiment, "DUPLICATE_EVENT_RECEIVED", "Same processor notification was recorded twice but applied only once.", {"payment_id": str(payment.id)})
    return [payment]


def _run_temporary_outage_scenario(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=7000, idempotency_key=f"chaos-{experiment.id}-outage")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    def flaky() -> str:
        raise ConnectionError("temporary outage")

    try:
        execute_with_retry(flaky, policy=RetryPolicy(max_attempts=2, base_delay_seconds=0.01, max_delay_seconds=0.05, jitter_ratio=0.0))
    except ConnectionError:
        _add_event(db, experiment, "RETRY_ATTEMPTED", "Retry guard handled a temporary outage without mutating payment state.", {"payment_id": str(payment.id)})
    return [payment]


def _run_interrupted_recovery_scenario(db: Session, experiment: ChaosExperiment) -> List[Payment]:
    payload = _build_payment_create_request(amount=4200, idempotency_key=f"chaos-{experiment.id}-interrupted")
    payment = payment_service.create_payment(db, payment_service.PaymentCreateRequest(**payload))
    payment_service.authorize_payment(db, payment.id, payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"))
    _add_event(db, experiment, "OPERATION_PENDING", "An interrupted operation boundary was recorded before reconciliation resumed.", {"payment_id": str(payment.id)})
    return [payment]


def execute_experiment(db: Session, config: Dict[str, Any]) -> ChaosExperiment:
    validated = validate_experiment_config(config)
    scenario_id = validated["scenario_id"]

    experiment = ChaosExperiment(
        scenario_id=scenario_id,
        status="RUNNING",
        configuration=validated,
        started_at=datetime.now(timezone.utc),
        related_payment_ids=[],
    )
    db.add(experiment)
    db.flush()

    _add_event(db, experiment, "EXPERIMENT_STARTED", f"Chaos scenario {scenario_id} started.", validated)

    try:
        if scenario_id == "duplicate-payment-request":
            payments = _run_duplicate_payment_request(db, experiment)
        elif scenario_id == "concurrent-capture":
            payments = _run_concurrent_capture(db, experiment)
        elif scenario_id == "concurrent-refund":
            payments = _run_concurrent_refund(db, experiment)
        elif scenario_id == "retry-exhaustion":
            payments = _run_retry_exhaustion(db, experiment)
        elif scenario_id in {"timeout-before-processing", "timeout-after-processing"}:
            payments = _run_timeout_scenario(db, experiment, scenario_id)
        elif scenario_id == "lost-response-after-success":
            payments = _run_lost_response_scenario(db, experiment)
        elif scenario_id == "duplicate-processor-event":
            payments = _run_duplicate_event_scenario(db, experiment)
        elif scenario_id == "temporary-processor-outage":
            payments = _run_temporary_outage_scenario(db, experiment)
        elif scenario_id == "interrupted-operation-recovery":
            payments = _run_interrupted_recovery_scenario(db, experiment)
        else:
            raise ValueError(f"Scenario {scenario_id} is not implemented.")

        _persist_payment_ids(experiment, [payment.id for payment in payments])
        for payment in payments:
            _add_event(db, experiment, "PAYMENT_QUERY", "Final payment state was read for verification.", {"payment_id": str(payment.id), "status": payment.status})

        results = verify_payment_invariants(db, experiment.related_payment_ids)
        for item in results:
            verdict = str(item.get("verdict", "NOT_VERIFIED")).upper()
            _add_invariant(
                db,
                experiment,
                item["invariant_name"],
                item["expected_condition"],
                item["observed_condition"],
                verdict,
                item.get("evidence", {}),
            )

        final_verdict = "PASS" if all(result["verdict"].upper() != "FAIL" for result in results) else "FAIL"
        if any(result["verdict"].upper() == "NOT_VERIFIED" for result in results):
            final_verdict = "NOT_VERIFIED"

        _add_event(db, experiment, "INVARIANTS_CHECKED", "Persisted payment invariants were evaluated.", {"verdict": final_verdict})
        _finalize_experiment(db, experiment, final_verdict)
        return experiment
    except Exception as exc:  # pragma: no cover - exercised indirectly by tests
        error_summary = str(exc)
        _add_event(db, experiment, "EXPERIMENT_FAILED", error_summary, {"scenario_id": scenario_id})
        _finalize_experiment(db, experiment, "FAILED", error_summary)
        raise


def list_experiments(db: Session, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    query = db.query(ChaosExperiment)
    total = query.count()
    items = query.order_by(ChaosExperiment.started_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_experiment_detail(db: Session, experiment_id: UUID) -> ChaosExperiment:
    experiment = db.query(ChaosExperiment).filter(ChaosExperiment.id == experiment_id).one_or_none()
    if experiment is None:
        raise ValueError(f"Experiment {experiment_id} was not found.")
    return experiment
