import uuid

from app.models.payment import Payment
from app.models.processor_attempt import ProcessorAttempt
from app.models.processor_routing import ProcessorRoutingDecision
from app.services.processor_router import (
    CircuitBreaker,
    ProcessorRouter,
    ReliabilityAwareStrategy,
    RoundRobinStrategy,
    SimulatedProcessor,
)


def test_round_robin_distribution_uses_ordered_selection():
    processors = [
        SimulatedProcessor("alpha", availability=1.0, baseline_latency_ms=40),
        SimulatedProcessor("beta", availability=1.0, baseline_latency_ms=80),
    ]
    router = ProcessorRouter(processors=processors, default_policy="round_robin")

    first = router.select_processor(operation_type="authorize", currency="USD")
    second = router.select_processor(operation_type="authorize", currency="USD")

    assert first.processor_id == "alpha"
    assert second.processor_id == "beta"


def test_lowest_latency_policy_prefers_fastest_eligible_processor():
    processors = [
        SimulatedProcessor("alpha", availability=1.0, baseline_latency_ms=120),
        SimulatedProcessor("beta", availability=1.0, baseline_latency_ms=40),
    ]
    router = ProcessorRouter(processors=processors, default_policy="lowest_latency")

    selected = router.select_processor(operation_type="capture", currency="USD")

    assert selected.processor_id == "beta"


def test_reliability_aware_strategy_scores_health_and_success_rate():
    alpha = SimulatedProcessor("alpha", availability=1.0, baseline_latency_ms=60)
    alpha.record_result("SUCCESS", latency_ms=30)
    alpha.record_result("SUCCESS", latency_ms=35)
    alpha.record_result("FAILED", latency_ms=100, error_code="TIMEOUT")

    beta = SimulatedProcessor("beta", availability=1.0, baseline_latency_ms=40)
    beta.record_result("SUCCESS", latency_ms=42)
    beta.record_result("SUCCESS", latency_ms=44)
    beta.record_result("SUCCESS", latency_ms=46)

    router = ProcessorRouter(processors=[alpha, beta], default_policy="reliability_aware")
    selected = router.select_processor(operation_type="refund", currency="USD")

    assert selected.processor_id == "beta"


def test_circuit_breaker_tracks_failure_threshold_and_recovery():
    breaker = CircuitBreaker(failure_threshold=2, evaluation_window=5, recovery_cooldown_seconds=1)

    breaker.record_failure()
    breaker.record_failure()
    assert breaker.state == "OPEN"

    breaker.mark_half_open()
    assert breaker.state == "HALF_OPEN"

    breaker.record_success()
    assert breaker.state == "CLOSED"


def test_safe_failover_blocks_unknown_outcome_retries():
    processor = SimulatedProcessor("alpha", availability=1.0, baseline_latency_ms=50)
    router = ProcessorRouter(processors=[processor], default_policy="round_robin")

    result = router.evaluate_safe_failover(
        processor_id="alpha",
        operation_id=str(uuid.uuid4()),
        latest_outcome={"status": "UNKNOWN", "error_code": "RESPONSE_LOST"},
    )

    assert result["safe"] is False


def test_routing_metrics_count_persisted_decisions(client, db_session):
    payment = Payment(
        amount=1500,
        currency="USD",
        idempotency_key=f"metric-{uuid.uuid4()}",
        client_id="audit-client",
    )
    db_session.add(payment)
    db_session.flush()

    db_session.add(
        ProcessorAttempt(
            payment_id=payment.id,
            processor_id="alpha",
            status="SUCCESS",
            error_code=None,
        )
    )
    db_session.add(
        ProcessorRoutingDecision(
            payment_id=payment.id,
            logical_operation_id=f"route-{uuid.uuid4()}",
            processor_id="alpha",
            routing_policy="round_robin",
            selection_reason="test metric count",
            observed_processor_health="CLOSED",
            estimated_latency_ms=40,
            outcome="APPROVED",
            actual_latency_ms=42,
        )
    )
    db_session.commit()

    response = client.get("/api/v1/routing/metrics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_decisions"] == 1


def test_routing_simulation_endpoint_returns_benchmark(client):
    response = client.post(
        "/api/v1/routing/simulations",
        json={"scenario": "all_healthy", "iterations": 25},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"] == "all_healthy"
    assert set(payload["benchmark"]).issuperset({"round_robin", "lowest_latency", "reliability_aware"})
