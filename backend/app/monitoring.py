from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

HTTP_REQUESTS_TOTAL = Counter(
    "paysure_http_requests_total",
    "Total HTTP requests handled by PaySure.",
    labelnames=("method", "route", "status"),
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "paysure_http_request_duration_seconds",
    "HTTP request latency in seconds.",
    labelnames=("method", "route", "status"),
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0),
)

PAYMENT_OPERATIONS_TOTAL = Counter(
    "paysure_payment_operations_total",
    "Total payment operations processed by the service layer.",
    labelnames=("operation", "status"),
)

PAYMENT_OPERATION_DURATION_SECONDS = Histogram(
    "paysure_payment_operation_duration_seconds",
    "Duration of payment operations in seconds.",
    labelnames=("operation", "status"),
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0),
)

PROCESSOR_ATTEMPTS_TOTAL = Counter(
    "paysure_processor_attempts_total",
    "Total processor attempts recorded by PaySure.",
    labelnames=("processor_id", "status"),
)

PROCESSOR_TIMEOUTS_TOTAL = Counter(
    "paysure_processor_timeouts_total",
    "Total processor timeout events observed.",
    labelnames=("processor_id",),
)

RETRIES_TOTAL = Counter(
    "paysure_retries_total",
    "Total retry attempts triggered for transient failures.",
    labelnames=("operation", "outcome"),
)

RECONCILIATION_TOTAL = Counter(
    "paysure_reconciliation_total",
    "Total reconciliation outcomes observed.",
    labelnames=("outcome",),
)

ROUTING_DECISIONS_TOTAL = Counter(
    "paysure_routing_decisions_total",
    "Total routing decisions emitted by PaySure.",
    labelnames=("processor_id", "routing_policy", "outcome"),
)

PROCESSOR_REQUESTS_TOTAL = Counter(
    "paysure_processor_requests_total",
    "Total processor requests observed by operation type and outcome.",
    labelnames=("processor_id", "operation_type", "outcome"),
)

PROCESSOR_REQUEST_DURATION_SECONDS = Histogram(
    "paysure_processor_request_duration_seconds",
    "Time spent issuing processor requests in seconds.",
    labelnames=("processor_id", "operation_type", "outcome"),
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0),
)

PROCESSOR_FAILOVERS_TOTAL = Counter(
    "paysure_processor_failovers_total",
    "Total failover events across processors.",
    labelnames=("from_processor", "to_processor", "reason"),
)

CIRCUIT_BREAKER_TRANSITIONS_TOTAL = Counter(
    "paysure_circuit_breaker_transitions_total",
    "Total circuit-breaker transitions observed.",
    labelnames=("processor_id", "from_state", "to_state"),
)

CHAOS_EXPERIMENTS_TOTAL = Counter(
    "paysure_chaos_experiments_total",
    "Total chaos experiments by scenario and final status.",
    labelnames=("scenario_id", "status"),
)


def record_http_request(method: str, route: str, status_code: int, duration_seconds: float) -> None:
    HTTP_REQUESTS_TOTAL.labels(method=method, route=route, status=str(status_code)).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(method=method, route=route, status=str(status_code)).observe(duration_seconds)


def record_payment_operation(operation: str, status: str, duration_seconds: float) -> None:
    PAYMENT_OPERATIONS_TOTAL.labels(operation=operation, status=status).inc()
    PAYMENT_OPERATION_DURATION_SECONDS.labels(operation=operation, status=status).observe(duration_seconds)


def record_processor_attempt(processor_id: str, status: str) -> None:
    PROCESSOR_ATTEMPTS_TOTAL.labels(processor_id=processor_id or "unknown", status=status).inc()
    if status.upper() == "TIMEOUT":
        PROCESSOR_TIMEOUTS_TOTAL.labels(processor_id=processor_id or "unknown").inc()


def record_retry(operation: str, outcome: str) -> None:
    RETRIES_TOTAL.labels(operation=operation, outcome=outcome).inc()


def record_reconciliation(outcome: str) -> None:
    RECONCILIATION_TOTAL.labels(outcome=outcome).inc()


def record_routing_decision(processor_id: str, routing_policy: str, outcome: str) -> None:
    ROUTING_DECISIONS_TOTAL.labels(processor_id=processor_id or "unknown", routing_policy=routing_policy or "unknown", outcome=outcome or "unknown").inc()


def record_processor_request(processor_id: str, operation_type: str, outcome: str, duration_seconds: float) -> None:
    PROCESSOR_REQUESTS_TOTAL.labels(processor_id=processor_id or "unknown", operation_type=operation_type or "unknown", outcome=outcome or "unknown").inc()
    PROCESSOR_REQUEST_DURATION_SECONDS.labels(processor_id=processor_id or "unknown", operation_type=operation_type or "unknown", outcome=outcome or "unknown").observe(duration_seconds)


def record_processor_failover(from_processor: str, to_processor: str, reason: str) -> None:
    PROCESSOR_FAILOVERS_TOTAL.labels(from_processor=from_processor or "unknown", to_processor=to_processor or "unknown", reason=reason or "unknown").inc()


def record_circuit_breaker_transition(processor_id: str, from_state: str, to_state: str) -> None:
    CIRCUIT_BREAKER_TRANSITIONS_TOTAL.labels(processor_id=processor_id or "unknown", from_state=from_state or "unknown", to_state=to_state or "unknown").inc()


def record_chaos_experiment(scenario_id: str, status: str) -> None:
    CHAOS_EXPERIMENTS_TOTAL.labels(scenario_id=scenario_id or "unknown", status=status).inc()


def get_prometheus_metrics() -> bytes:
    return generate_latest()


def get_metric_value(metric_name: str, label_name: Optional[str] = None, label_value: Optional[str] = None) -> Optional[float]:
    from prometheus_client import REGISTRY

    for metric in REGISTRY.collect():
        if metric.name != metric_name:
            continue
        if label_name is None:
            for sample in metric.samples:
                if sample.name == metric_name and sample.value is not None:
                    return float(sample.value)
            return None
        for sample in metric.samples:
            if sample.name == metric_name and sample.labels.get(label_name) == label_value:
                return float(sample.value)
    return None


def get_histogram_percentile(metric_name: str, percentile: float) -> Optional[float]:
    from prometheus_client import REGISTRY

    target = percentile / 100.0
    for metric in REGISTRY.collect():
        if metric.name != metric_name:
            continue
        for sample in metric.samples:
            if sample.name.endswith("_bucket"):
                bucket_le = sample.labels.get("le")
                try:
                    upper_bound = float(bucket_le)
                except (TypeError, ValueError):
                    continue
                if target <= 0:
                    return 0.0
                if sample.value > 0:
                    return upper_bound
    return None
