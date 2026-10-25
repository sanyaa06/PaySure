from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.chaos import ChaosExperiment
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.processor_attempt import ProcessorAttempt

router = APIRouter(prefix="/monitoring")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _percentile(values: Iterable[float], percentile: float) -> float | None:
    ordered = sorted(float(value) for value in values if value is not None)
    if not ordered:
        return None
    if len(ordered) == 1:
        return round(ordered[0], 2)
    rank = max(0, min(len(ordered) - 1, math.ceil((percentile / 100.0) * len(ordered)) - 1))
    return round(ordered[rank], 2)


def _payment_failure_rate(db: Session) -> float | None:
    total = db.query(func.count(Payment.id)).scalar() or 0
    if total == 0:
        return None
    failed = db.query(func.count(Payment.id)).filter(Payment.status == "FAILED").scalar() or 0
    return round((failed / total) * 100.0, 2)


def _build_latency_history(db: Session, since: datetime, bucket_count: int = 12) -> List[Dict[str, Any]]:
    attempts = db.query(ProcessorAttempt).filter(
        ProcessorAttempt.started_at.is_not(None),
        ProcessorAttempt.completed_at.is_not(None),
        ProcessorAttempt.completed_at >= since,
    ).all()
    items: List[Dict[str, Any]] = []
    bucket_size = timedelta(hours=24) / bucket_count if bucket_count else timedelta(hours=24)
    for index in range(bucket_count):
        bucket_start = since + (bucket_size * index)
        bucket_end = bucket_start + bucket_size
        bucket_values = []
        for attempt in attempts:
            started_at = _as_utc(attempt.started_at)
            completed_at = _as_utc(attempt.completed_at)
            if started_at and completed_at and bucket_start <= completed_at < bucket_end:
                elapsed = (completed_at - started_at).total_seconds() * 1000.0
                if elapsed >= 0:
                    bucket_values.append(elapsed)
        items.append({
            "timestamp": bucket_start.isoformat(),
            "p95_ms": _percentile(bucket_values, 95),
        })
    return items


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    total_payments = db.query(func.count(Payment.id)).scalar() or 0
    payments_by_status = {
        row.status: row.count
        for row in db.query(Payment.status, func.count(Payment.id).label("count")).group_by(Payment.status).all()
    }
    total_authorized = db.query(func.count(Payment.id)).filter(Payment.status == "AUTHORIZED").scalar() or 0
    total_captured = db.query(func.count(Payment.id)).filter(Payment.status == "CAPTURED").scalar() or 0
    total_refunded = db.query(func.count(Payment.id)).filter(Payment.status == "REFUNDED").scalar() or 0
    total_failed = db.query(func.count(Payment.id)).filter(Payment.status == "FAILED").scalar() or 0
    unresolved_processor_attempts = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status.in_(["PENDING", "UNKNOWN", "TIMEOUT"])).scalar() or 0
    completed_chaos = db.query(func.count(ChaosExperiment.id)).filter(ChaosExperiment.status == "COMPLETED").scalar() or 0
    failed_chaos = db.query(func.count(ChaosExperiment.id)).filter(ChaosExperiment.status == "FAILED").scalar() or 0
    recent_chaos = [
        {
            "id": str(item.id),
            "scenario_id": item.scenario_id,
            "status": item.status,
            "final_verdict": item.final_verdict,
            "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        }
        for item in db.query(ChaosExperiment).order_by(ChaosExperiment.started_at.desc()).limit(5).all()
    ]
    return {
        "total_payments": total_payments,
        "payments_by_status": payments_by_status,
        "total_authorized_payments": total_authorized,
        "total_captured_payments": total_captured,
        "total_refunded_payments": total_refunded,
        "total_failed_payments": total_failed,
        "unresolved_processor_operations": unresolved_processor_attempts,
        "completed_chaos_experiments": completed_chaos,
        "failed_chaos_experiments": failed_chaos,
        "recent_chaos": recent_chaos,
        "generated_at": _utc_now().isoformat(),
    }


@router.get("/transactions/timeseries")
def get_transaction_timeseries(
    window: str = Query(default="24h", pattern="^(15m|1h|24h|7d)$"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    delta = {"15m": timedelta(minutes=15), "1h": timedelta(hours=1), "24h": timedelta(days=1), "7d": timedelta(days=7)}[window]
    since = _utc_now() - delta
    bucket_count = 12
    bucket_size = delta / bucket_count
    items: List[Dict[str, Any]] = []

    for index in range(bucket_count):
        bucket_start = since + (bucket_size * index)
        bucket_end = bucket_start + bucket_size
        created = db.query(func.count(Payment.id)).filter(Payment.created_at >= bucket_start, Payment.created_at < bucket_end).scalar() or 0
        authorizations = db.query(func.count(PaymentEvent.id)).filter(
            PaymentEvent.event_type == "AUTHORIZATION_SUCCEEDED",
            PaymentEvent.created_at >= bucket_start,
            PaymentEvent.created_at < bucket_end,
        ).scalar() or 0
        captures = db.query(func.count(PaymentEvent.id)).filter(
            PaymentEvent.event_type == "PAYMENT_CAPTURED",
            PaymentEvent.created_at >= bucket_start,
            PaymentEvent.created_at < bucket_end,
        ).scalar() or 0
        refunds = db.query(func.count(PaymentEvent.id)).filter(
            PaymentEvent.event_type.like("%REFUND%"),
            PaymentEvent.created_at >= bucket_start,
            PaymentEvent.created_at < bucket_end,
        ).scalar() or 0
        failed = db.query(func.count(Payment.id)).filter(
            Payment.status == "FAILED",
            Payment.created_at >= bucket_start,
            Payment.created_at < bucket_end,
        ).scalar() or 0
        items.append({
            "timestamp": bucket_start.isoformat(),
            "created": int(created),
            "authorizations": int(authorizations),
            "captures": int(captures),
            "refunds": int(refunds),
            "failed": int(failed),
        })

    return {"window": window, "bucket_size": "auto", "items": items}


@router.get("/reliability")
def get_reliability(db: Session = Depends(get_db)) -> Dict[str, Any]:
    total_attempts = db.query(func.count(ProcessorAttempt.id)).scalar() or 0
    timeout_count = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status == "TIMEOUT").scalar() or 0
    success_count = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status == "SUCCESS").scalar() or 0
    failure_count = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status.in_(["FAILED", "TIMEOUT"])) .scalar() or 0
    retry_rows = db.query(ProcessorAttempt.payment_id, func.count(ProcessorAttempt.id).label("attempt_count")).group_by(ProcessorAttempt.payment_id).having(func.count(ProcessorAttempt.id) > 1).all()
    retry_count = sum(int(row.attempt_count) - 1 for row in retry_rows)
    unresolved = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status.in_(["PENDING", "UNKNOWN"])) .scalar() or 0
    reconciliation_attempts = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status == "UNKNOWN").scalar() or 0
    reconciliation_success_count = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status == "SUCCESS", ProcessorAttempt.error_code == "RESPONSE_LOST").scalar() or 0
    processor_failure_rate = None if total_attempts == 0 else round((failure_count / total_attempts) * 100.0, 2)
    return {
        "processor_success_rate": None if total_attempts == 0 else round((success_count / total_attempts) * 100.0, 2),
        "processor_failure_rate": processor_failure_rate,
        "timeout_count": timeout_count,
        "retry_count": retry_count,
        "retry_exhaustion_count": db.query(func.count(ChaosExperiment.id)).filter(ChaosExperiment.final_verdict == "FAIL").scalar() or 0,
        "reconciliation_attempts": reconciliation_attempts,
        "reconciliation_success_count": reconciliation_success_count,
        "unresolved_operations": unresolved,
        "duplicate_operations_prevented": 0,
        "chaos_experiments_completed": db.query(func.count(ChaosExperiment.id)).filter(ChaosExperiment.status == "COMPLETED").scalar() or 0,
        "chaos_invariant_failures": db.query(func.count(ChaosExperiment.id)).filter(ChaosExperiment.final_verdict == "FAIL").scalar() or 0,
        "generated_at": _utc_now().isoformat(),
    }


@router.get("/latency")
def get_latency(db: Session = Depends(get_db)) -> Dict[str, Any]:
    latency_values = []
    for attempt in db.query(ProcessorAttempt).filter(
        ProcessorAttempt.started_at.is_not(None),
        ProcessorAttempt.completed_at.is_not(None),
    ).all():
        started_at = _as_utc(attempt.started_at)
        completed_at = _as_utc(attempt.completed_at)
        if started_at and completed_at:
            elapsed_ms = (completed_at - started_at).total_seconds() * 1000.0
            if elapsed_ms >= 0:
                latency_values.append(elapsed_ms)

    latency_history = _build_latency_history(db, _utc_now() - timedelta(days=1))
    return {
        "window": "24h",
        "p50_ms": _percentile(latency_values, 50),
        "p95_ms": _percentile(latency_values, 95),
        "p99_ms": _percentile(latency_values, 99),
        "history": latency_history,
        "note": "Derived from completed processor_attempt rows when available.",
        "generated_at": _utc_now().isoformat(),
    }


@router.get("/stuck-operations")
def get_stuck_operations(db: Session = Depends(get_db)) -> Dict[str, Any]:
    threshold = timedelta(minutes=5)
    now = _utc_now()
    items: List[Dict[str, Any]] = []
    payments = db.query(Payment).filter(Payment.status.in_(["CREATED", "AUTHORIZED", "PENDING", "FAILED"])).all()
    for payment in payments:
        activity_ts = _as_utc(payment.updated_at or payment.created_at)
        if activity_ts is None:
            continue
        age = now - activity_ts
        if age >= threshold:
            items.append({
                "operation_id": str(payment.id),
                "related_payment_id": str(payment.id),
                "current_state": payment.status,
                "time_in_current_state_seconds": int(age.total_seconds()),
                "reason_flagged": "payment has remained unresolved beyond threshold",
                "last_activity_timestamp": activity_ts.isoformat(),
            })
    return {"items": items, "generated_at": now.isoformat()}


@router.get("/alerts")
def get_alerts(db: Session = Depends(get_db)) -> Dict[str, Any]:
    now = _utc_now()
    total_payments = db.query(func.count(Payment.id)).scalar() or 0
    failure_rate = _payment_failure_rate(db)
    latency = get_latency(db)
    stuck = get_stuck_operations(db)
    unresolved = db.query(func.count(ProcessorAttempt.id)).filter(ProcessorAttempt.status.in_(["PENDING", "UNKNOWN"])) .scalar() or 0
    chaos_failures = db.query(func.count(ChaosExperiment.id)).filter(ChaosExperiment.final_verdict == "FAIL").scalar() or 0

    threshold_config = {
        "high_failure_rate": {"threshold": 25.0, "min_samples": 5},
        "high_p95_latency": {"threshold": 3000.0, "min_samples": 3},
        "unresolved_operations": {"threshold": 3, "min_samples": 1},
        "stuck_operations": {"threshold": 1, "min_samples": 1},
        "chaos_invariant_failures": {"threshold": 1, "min_samples": 1},
    }

    alerts: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def add_alert(code: str, severity: str, message: str, observed: Any, threshold: Any, status: str = "active") -> None:
        key = f"{code}:{status}"
        if key in seen:
            return
        seen.add(key)
        alerts.append({
            "id": f"alert-{code}-{status}",
            "code": code,
            "severity": severity,
            "status": status,
            "message": message,
            "observed": observed,
            "threshold": threshold,
            "created_at": now.isoformat(),
        })

    if total_payments >= threshold_config["high_failure_rate"]["min_samples"] and failure_rate is not None and failure_rate >= threshold_config["high_failure_rate"]["threshold"]:
        add_alert(
            "high_failure_rate",
            "warning",
            f"Failure rate reached {failure_rate}% against a {threshold_config['high_failure_rate']['threshold']}% threshold.",
            failure_rate,
            threshold_config["high_failure_rate"]["threshold"],
        )
    else:
        add_alert(
            "high_failure_rate",
            "info",
            "Failure rate is within the acceptable threshold.",
            failure_rate if failure_rate is not None else 0,
            threshold_config["high_failure_rate"]["threshold"],
            status="resolved",
        )

    if latency["p95_ms"] is not None and total_payments >= threshold_config["high_p95_latency"]["min_samples"] and latency["p95_ms"] >= threshold_config["high_p95_latency"]["threshold"]:
        add_alert(
            "high_p95_latency",
            "warning",
            f"p95 latency is {latency['p95_ms']}ms against a {threshold_config['high_p95_latency']['threshold']}ms threshold.",
            latency["p95_ms"],
            threshold_config["high_p95_latency"]["threshold"],
        )
    else:
        add_alert(
            "high_p95_latency",
            "info",
            "Latency remains within baseline targets.",
            latency["p95_ms"],
            threshold_config["high_p95_latency"]["threshold"],
            status="resolved",
        )

    if unresolved >= threshold_config["unresolved_operations"]["threshold"]:
        add_alert(
            "unresolved_operations",
            "warning",
            f"{unresolved} unresolved processor operations are still pending or unknown.",
            unresolved,
            threshold_config["unresolved_operations"]["threshold"],
        )
    else:
        add_alert(
            "unresolved_operations",
            "info",
            "No unresolved processor operations are currently above threshold.",
            unresolved,
            threshold_config["unresolved_operations"]["threshold"],
            status="resolved",
        )

    stuck_count = len(stuck["items"])
    if stuck_count >= threshold_config["stuck_operations"]["threshold"]:
        add_alert(
            "stuck_operations",
            "critical",
            f"{stuck_count} payment operations have remained in a stalled state beyond the threshold.",
            stuck_count,
            threshold_config["stuck_operations"]["threshold"],
        )
    else:
        add_alert(
            "stuck_operations",
            "info",
            "No stuck operations are currently exceeding the configured threshold.",
            stuck_count,
            threshold_config["stuck_operations"]["threshold"],
            status="resolved",
        )

    if chaos_failures >= threshold_config["chaos_invariant_failures"]["threshold"]:
        add_alert(
            "chaos_invariant_failures",
            "critical",
            f"{chaos_failures} Chaos Lab invariant failures have been observed.",
            chaos_failures,
            threshold_config["chaos_invariant_failures"]["threshold"],
        )
    else:
        add_alert(
            "chaos_invariant_failures",
            "info",
            "Chaos Lab invariant checks are currently stable.",
            chaos_failures,
            threshold_config["chaos_invariant_failures"]["threshold"],
            status="resolved",
        )

    active_alerts = [item for item in alerts if item["status"] == "active"]
    return {
        "items": alerts,
        "generated_at": now.isoformat(),
        "summary": {
            "total_alerts": len(alerts),
            "active_alerts": len(active_alerts),
            "resolved_alerts": len(alerts) - len(active_alerts),
            "total_transactions_sampled": total_payments,
        },
    }


@router.get("/health")
def get_monitoring_health(db: Session = Depends(get_db)) -> Dict[str, Any]:
    db_ok = db.execute(text("SELECT 1")).scalar() == 1
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "last_successful_refresh": _utc_now().isoformat(),
        "monitoring_window": "24h",
        "generated_at": _utc_now().isoformat(),
    }
