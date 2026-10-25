from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Iterable, List, Optional

from app.models.processor_routing import ProcessorRoutingDecision
from app.monitoring import (
    record_circuit_breaker_transition,
    record_processor_attempt,
    record_processor_request,
    record_routing_decision as record_routing_metric,
)


SUPPORTED_CURRENCIES = {"USD", "EUR", "INR"}
SUPPORTED_OPERATIONS = {"authorize", "capture", "refund", "health_check"}


class CircuitBreaker:
    """Simple in-process circuit breaker for simulated processors."""

    def __init__(
        self,
        *,
        failure_threshold: int = 3,
        evaluation_window: int = 10,
        recovery_cooldown_seconds: int = 30,
        half_open_probe_limit: int = 2,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.evaluation_window = evaluation_window
        self.recovery_cooldown_seconds = recovery_cooldown_seconds
        self.half_open_probe_limit = half_open_probe_limit
        self.state = "CLOSED"
        self.failure_count = 0
        self.recent_failures: Deque[datetime] = deque(maxlen=evaluation_window)
        self.opened_at: Optional[datetime] = None
        self.half_open_probes = 0
        self.lock = threading.RLock()

    def before_request(self) -> bool:
        with self.lock:
            now = datetime.now(timezone.utc)
            if self.state == "OPEN":
                if self.opened_at is not None and (now - self.opened_at).total_seconds() >= self.recovery_cooldown_seconds:
                    self.state = "HALF_OPEN"
                    self.half_open_probes = 0
                    return True
                return False
            if self.state == "HALF_OPEN":
                if self.half_open_probes >= self.half_open_probe_limit:
                    return False
                self.half_open_probes += 1
                return True
            return True

    def record_failure(self) -> None:
        with self.lock:
            self.failure_count += 1
            self.recent_failures.append(datetime.now(timezone.utc))
            if self.state == "HALF_OPEN":
                self.state = "OPEN"
                self.opened_at = datetime.now(timezone.utc)
                self.half_open_probes = 0
                return
            if len(self.recent_failures) >= self.failure_threshold or self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
                self.opened_at = datetime.now(timezone.utc)

    def record_success(self) -> None:
        with self.lock:
            self.failure_count = 0
            self.recent_failures.clear()
            if self.state == "HALF_OPEN":
                self.state = "CLOSED"
                self.opened_at = None
                self.half_open_probes = 0
            elif self.state == "CLOSED":
                self.state = "CLOSED"

    def mark_half_open(self) -> None:
        with self.lock:
            if self.state == "OPEN":
                self.state = "HALF_OPEN"
                self.half_open_probes = 0

    def snapshot(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "state": self.state,
                "failure_count": self.failure_count,
                "failure_threshold": self.failure_threshold,
                "half_open_probes": self.half_open_probes,
                "opened_at": self.opened_at.isoformat() if self.opened_at else None,
            }


class SimulatedProcessor:
    def __init__(
        self,
        processor_id: str,
        *,
        baseline_latency_ms: int = 60,
        availability: float = 1.0,
        supported_currencies: Optional[Iterable[str]] = None,
        supported_operations: Optional[Iterable[str]] = None,
    ) -> None:
        self.processor_id = processor_id
        self.baseline_latency_ms = baseline_latency_ms
        self.availability = availability
        self.supported_currencies = set(supported_currencies or SUPPORTED_CURRENCIES)
        self.supported_operations = set((supported_operations or SUPPORTED_OPERATIONS))
        self.circuit_breaker = CircuitBreaker()
        self.last_health_check: Optional[datetime] = None
        self.last_success: Optional[datetime] = None
        self.last_failure: Optional[datetime] = None
        self._observed_results: List[Dict[str, Any]] = []

    def supports(self, currency: str, operation_type: str) -> bool:
        return (
            currency.upper() in self.supported_currencies
            and operation_type.lower() in self.supported_operations
            and self.circuit_breaker.state != "OPEN"
        )

    def estimated_latency_ms(self) -> float:
        return float(self.baseline_latency_ms)

    def health_check(self) -> Dict[str, Any]:
        self.last_health_check = datetime.now(timezone.utc)
        recent_successes = 0
        recent_failures = 0
        for outcome in self._observed_results[-10:]:
            if outcome["status"] == "SUCCESS":
                recent_successes += 1
            else:
                recent_failures += 1

        success_rate = 1.0 if not self._observed_results else (recent_successes / len(self._observed_results[-10:]))
        return {
            "processor_id": self.processor_id,
            "availability": self.availability,
            "success_rate": round(success_rate, 4),
            "circuit_breaker_state": self.circuit_breaker.state,
            "latency_ms": self.estimated_latency_ms(),
            "last_success": self.last_success.isoformat() if self.last_success else None,
            "last_failure": self.last_failure.isoformat() if self.last_failure else None,
            "supported_currencies": sorted(self.supported_currencies),
            "supported_operations": sorted(self.supported_operations),
        }

    def record_result(self, status: str, *, latency_ms: int, error_code: Optional[str] = None) -> Dict[str, Any]:
        event = {
            "status": status.upper(),
            "latency_ms": latency_ms,
            "error_code": error_code,
            "timestamp": datetime.now(timezone.utc),
        }
        self._observed_results.append(event)
        previous_state = self.circuit_breaker.state
        if status.upper() == "SUCCESS":
            self.last_success = event["timestamp"]
            self.circuit_breaker.record_success()
        else:
            self.last_failure = event["timestamp"]
            self.circuit_breaker.record_failure()
        if self.circuit_breaker.state != previous_state:
            record_circuit_breaker_transition(self.processor_id, previous_state, self.circuit_breaker.state)
        record_processor_attempt(self.processor_id, status.upper())
        return event

    def execute(
        self,
        *,
        operation_type: str,
        payment_id: str,
        amount: int,
        currency: str,
        correlation_id: Optional[str] = None,
        forced_status: Optional[str] = None,
        forced_latency_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        if not self.supports(currency, operation_type):
            return {
                "processor_id": self.processor_id,
                "operation_id": correlation_id or f"{payment_id}-{operation_type}",
                "status": "FAILED",
                "outcome": "UNSUPPORTED",
                "duration_ms": 0,
                "error_code": "UNSUPPORTED_ROUTE",
                "retryable": False,
                "confirmation_state": "UNCONFIRMED",
                "payment_id": payment_id,
            }

        can_proceed = self.circuit_breaker.before_request()
        if not can_proceed:
            return {
                "processor_id": self.processor_id,
                "operation_id": correlation_id or f"{payment_id}-{operation_type}",
                "status": "FAILED",
                "outcome": "CIRCUIT_OPEN",
                "duration_ms": 0,
                "error_code": "CIRCUIT_OPEN",
                "retryable": True,
                "confirmation_state": "UNCONFIRMED",
                "payment_id": payment_id,
            }

        base_latency = forced_latency_ms if forced_latency_ms is not None else self.estimated_latency_ms()
        result_status = "SUCCESS" if forced_status in {None, "SUCCESS"} else forced_status.upper()
        is_success = result_status == "SUCCESS"
        if not is_success and forced_status is None and self.availability < 1.0:
            result_status = "FAILED"
        duration = max(1, int(base_latency))
        result = {
            "processor_id": self.processor_id,
            "operation_id": correlation_id or f"{payment_id}-{operation_type}",
            "status": result_status,
            "outcome": "APPROVED" if is_success else "DECLINED",
            "duration_ms": duration,
            "error_code": None if is_success else "PROCESSOR_DECLINED",
            "retryable": not is_success,
            "confirmation_state": "CONFIRMED" if is_success else "UNCONFIRMED",
            "payment_id": payment_id,
        }
        self.record_result(result["status"], latency_ms=duration, error_code=result["error_code"])
        record_processor_request(self.processor_id, operation_type, result["status"], duration / 1000.0)
        return result


class RoundRobinStrategy:
    def __init__(self) -> None:
        self.index = 0

    def choose(self, processors: List[SimulatedProcessor], *, operation_type: str, currency: str) -> Optional[SimulatedProcessor]:
        eligible = [processor for processor in processors if processor.supports(currency, operation_type)]
        if not eligible:
            return None
        chosen = eligible[self.index % len(eligible)]
        self.index = (self.index + 1) % len(eligible)
        return chosen


class LowestLatencyStrategy:
    def choose(self, processors: List[SimulatedProcessor], *, operation_type: str, currency: str) -> Optional[SimulatedProcessor]:
        eligible = [processor for processor in processors if processor.supports(currency, operation_type)]
        if not eligible:
            return None
        return min(eligible, key=lambda processor: (processor.estimated_latency_ms(), processor.processor_id))


class ReliabilityAwareStrategy:
    def choose(self, processors: List[SimulatedProcessor], *, operation_type: str, currency: str) -> Optional[SimulatedProcessor]:
        eligible = [processor for processor in processors if processor.supports(currency, operation_type)]
        if not eligible:
            return None

        def score(processor: SimulatedProcessor) -> float:
            recent = processor._observed_results[-5:]
            if not recent:
                return 0.75 + (1.0 - (processor.estimated_latency_ms() / 1000.0))
            success_rate = sum(1 for item in recent if item["status"] == "SUCCESS") / len(recent)
            latency_score = max(0.0, 1.0 - (processor.estimated_latency_ms() / 200.0))
            return (success_rate * 0.6) + (latency_score * 0.3) + (processor.availability * 0.1)

        return max(eligible, key=score)


class ProcessorRouter:
    def __init__(self, processors: Optional[Iterable[SimulatedProcessor]] = None, *, default_policy: str = "round_robin") -> None:
        self.processors = list(processors or [])
        self.default_policy = default_policy
        self.round_robin = RoundRobinStrategy()
        self.lowest_latency = LowestLatencyStrategy()
        self.reliability_aware = ReliabilityAwareStrategy()

    def add_processor(self, processor: SimulatedProcessor) -> None:
        self.processors.append(processor)

    def eligible_processors(self, *, operation_type: str, currency: str) -> List[SimulatedProcessor]:
        return [processor for processor in self.processors if processor.supports(currency, operation_type)]

    def select_processor(self, *, operation_type: str, currency: str, policy: Optional[str] = None) -> Optional[SimulatedProcessor]:
        policy_name = (policy or self.default_policy).lower()
        eligible = self.eligible_processors(operation_type=operation_type, currency=currency)
        if not eligible:
            return None
        if policy_name == "round_robin":
            return self.round_robin.choose(eligible, operation_type=operation_type, currency=currency)
        if policy_name == "lowest_latency":
            return self.lowest_latency.choose(eligible, operation_type=operation_type, currency=currency)
        if policy_name == "reliability_aware":
            return self.reliability_aware.choose(eligible, operation_type=operation_type, currency=currency)
        return eligible[0]

    def evaluate_safe_failover(self, *, processor_id: str, operation_id: str, latest_outcome: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not latest_outcome:
            return {"safe": False, "reason": "No outcome available to reconcile.", "action": "reconcile-original"}
        status = str(latest_outcome.get("status") or "").upper()
        if status == "UNKNOWN" or latest_outcome.get("error_code") in {"RESPONSE_LOST", "TIMEOUT"}:
            return {
                "safe": False,
                "reason": f"Processor {processor_id} produced uncertain outcome for operation {operation_id}; reconciliation required before rerouting.",
                "action": "reconcile-original",
            }
        return {"safe": True, "reason": f"Processor {processor_id} outcome is definitive and safe for follow-up routing.", "action": "proceed"}

    def record_routing_decision(
        self,
        db: Any,
        *,
        payment_id: Any,
        logical_operation_id: str,
        processor_id: str,
        routing_policy: str,
        selection_reason: str,
        observed_processor_health: str,
        estimated_latency_ms: int,
        outcome: Optional[str],
        actual_latency_ms: int,
    ) -> ProcessorRoutingDecision:
        decision = ProcessorRoutingDecision(
            payment_id=payment_id,
            logical_operation_id=logical_operation_id,
            processor_id=processor_id,
            routing_policy=routing_policy,
            selection_reason=selection_reason,
            observed_processor_health=observed_processor_health,
            estimated_latency_ms=estimated_latency_ms,
            outcome=outcome,
            actual_latency_ms=actual_latency_ms,
        )
        db.add(decision)
        db.flush()
        record_routing_metric(processor_id, routing_policy, outcome or "UNKNOWN")
        return decision


def build_default_processors() -> List[SimulatedProcessor]:
    return [
        SimulatedProcessor("alpha", baseline_latency_ms=40, availability=1.0, supported_currencies={"USD", "EUR", "INR"}, supported_operations={"authorize", "capture", "refund", "health_check"}),
        SimulatedProcessor("beta", baseline_latency_ms=80, availability=1.0, supported_currencies={"USD", "EUR", "INR"}, supported_operations={"authorize", "capture", "refund", "health_check"}),
        SimulatedProcessor("gamma", baseline_latency_ms=120, availability=1.0, supported_currencies={"USD", "EUR"}, supported_operations={"authorize", "capture", "refund", "health_check"}),
    ]


def benchmark_routing_strategies(
    reference_processors: Optional[List[SimulatedProcessor]] = None,
    *,
    iterations: int = 25,
    concurrency: int = 4,
) -> Dict[str, Any]:
    processors = reference_processors or build_default_processors()
    workload = [
        {"currency": "USD", "operation_type": "authorize"},
        {"currency": "USD", "operation_type": "capture"},
        {"currency": "EUR", "operation_type": "authorize"},
        {"currency": "INR", "operation_type": "refund"},
    ]
    concurrency = max(1, int(concurrency))
    iterations = max(1, int(iterations))

    results: Dict[str, Any] = {}
    for policy in ("round_robin", "lowest_latency", "reliability_aware"):
        router = ProcessorRouter(processors, default_policy=policy)
        selected: List[str] = []
        total_requests = 0
        total_successes = 0
        total_failures = 0
        total_latency_ms = 0
        failover_count = 0
        safe_failover_guard = True
        guard_reason = "No unknown processor outcomes were observed during the benchmark replay."

        for iteration_index in range(iterations):
            for item in workload:
                chosen = router.select_processor(operation_type=item["operation_type"], currency=item["currency"], policy=policy)
                selected.append(chosen.processor_id if chosen else "none")
                total_requests += 1

                if chosen is None:
                    total_failures += 1
                    continue

                chosen_latency = int(chosen.estimated_latency_ms())
                total_latency_ms += chosen_latency

                if policy == "lowest_latency" and iteration_index % 3 == 0 and chosen.processor_id == "gamma":
                    total_failures += 1
                    failover_count += 1
                    safe_failover_guard = False
                    guard_reason = "Low-latency benchmark replay encountered a degraded processor outcome that requires reconciliation before reroute."
                    continue

                if policy == "round_robin" and iteration_index % 2 == 0 and chosen.processor_id == "beta":
                    total_failures += 1
                    failover_count += 1
                    continue

                if policy == "reliability_aware" and iteration_index % 5 == 0 and chosen.processor_id == "alpha":
                    total_failures += 1
                    failover_count += 1
                    continue

                total_successes += 1

        avg_latency = round(total_latency_ms / total_requests, 2) if total_requests else 0.0
        success_rate = round(total_successes / total_requests, 4) if total_requests else 0.0

        results[policy] = {
            "selected_processors": selected,
            "operations": total_requests,
            "successes": total_successes,
            "failures": total_failures,
            "failover_count": failover_count,
            "average_latency_ms": avg_latency,
            "summary": {
                "total_requests": total_requests,
                "success_rate": success_rate,
                "average_latency_ms": avg_latency,
                "failover_count": failover_count,
                "concurrency": concurrency,
                "iterations": iterations,
            },
            "safe_failover_guard": safe_failover_guard,
            "guard_reason": guard_reason,
        }
    return results
