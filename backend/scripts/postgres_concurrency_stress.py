import json
import os
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

PROJECT_ROOT = None
for candidate in (Path(__file__).resolve().parent, Path(__file__).resolve().parent.parent, Path(__file__).resolve().parent.parent.parent):
    if (candidate / "app").is_dir():
        PROJECT_ROOT = candidate
        break
if PROJECT_ROOT is None and (Path(__file__).resolve().parent / "backend" / "app").is_dir():
    PROJECT_ROOT = Path(__file__).resolve().parent / "backend"
if PROJECT_ROOT is not None and str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.state_machine import PaymentStatus
from app.models.payment import Payment
from app.services import payment_service
from app.services.invariant_checker import verify_payment_invariants

RAW_RESULTS_DIR = (PROJECT_ROOT / "docs" / "raw") if PROJECT_ROOT is not None else (Path(__file__).resolve().parent / "docs" / "raw")
RAW_RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def make_session_factory():
    settings = get_settings()
    engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


SessionLocal = make_session_factory()


def _create_record(amount: int, idempotency_key: str, currency: str = "USD"):
    with SessionLocal() as db:
        payment = payment_service.create_payment(
            db,
            payment_service.PaymentCreateRequest(
                amount=amount,
                currency=currency,
                idempotency_key=idempotency_key,
                client_id="perf-stress",
            ),
        )
        return str(payment.id)


def _authorize_capture(payment_id: str):
    with SessionLocal() as db:
        payment_service.authorize_payment(
            db,
            uuid.UUID(payment_id),
            payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"),
        )
        payment_service.capture_payment(db, uuid.UUID(payment_id))


def _refund(payment_id: str, amount: int, key: str):
    with SessionLocal() as db:
        payment = payment_service.get_payment(db, uuid.UUID(payment_id))
        if payment.status not in {PaymentStatus.CAPTURED.value, PaymentStatus.PARTIALLY_REFUNDED.value}:
            return {"status": "skipped", "reason": payment.status}
        refund = payment_service.refund_payment(
            db,
            uuid.UUID(payment_id),
            payment_service.RefundRequest(amount=amount, idempotency_key=key),
        )
        return {"status": refund.status, "refunded_amount": refund.refunded_amount}


def run_duplicate_creation(parallelism: int = 20):
    key = f"dup-create-{uuid.uuid4()}"
    barrier = threading.Barrier(parallelism)
    results: list[str] = []
    conflicts = 0
    errors = []

    def worker():
        barrier.wait()
        try:
            payment_id = _create_record(3750, key)
            results.append(payment_id)
        except Exception as exc:  # pragma: no cover - stress benchmark
            conflicts += 1
            errors.append(str(exc))

    with ThreadPoolExecutor(max_workers=parallelism) as pool:
        for _ in range(parallelism):
            pool.submit(worker)

    unique_ids = len({item for item in results})
    summary = {
        "scenario": "duplicate_creation",
        "parallel_requests": parallelism,
        "trials": parallelism,
        "unique_payment_ids": unique_ids,
        "conflicts": conflicts,
        "duplicate_financial_effects": max(0, parallelism - unique_ids),
        "errors": errors,
    }
    return summary


def run_simultaneous_capture(parallelism: int = 25):
    payment_id = _create_record(10000, f"sim-capture-{uuid.uuid4()}")
    with SessionLocal() as db:
        payment_service.authorize_payment(
            db,
            uuid.UUID(payment_id),
            payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"),
        )
        db.commit()

    attempts = 0
    successes = 0
    conflicts = 0
    barrier = threading.Barrier(parallelism)

    def worker():
        nonlocal attempts, successes, conflicts
        barrier.wait()
        try:
            attempts += 1
            _authorize_capture(payment_id)
            successes += 1
        except Exception:
            conflicts += 1

    with ThreadPoolExecutor(max_workers=parallelism) as pool:
        futures = [pool.submit(worker) for _ in range(parallelism)]
        for future in futures:
            future.result()

    with SessionLocal() as db:
        payment = payment_service.get_payment(db, uuid.UUID(payment_id))
        invariants = verify_payment_invariants(db, [payment_id])

    return {
        "scenario": "simultaneous_capture",
        "parallel_requests": parallelism,
        "trials": attempts,
        "successful_captures": successes,
        "conflicts": conflicts,
        "duplicate_financial_effects": 0 if payment.captured_amount == payment.amount else max(0, payment.captured_amount // payment.amount),
        "final_status": payment.status,
        "captured_amount": payment.captured_amount,
        "invariants": invariants,
    }


def run_concurrent_refunds(parallelism: int = 20):
    payment_id = _create_record(40000, f"concurrent-refund-{uuid.uuid4()}")
    with SessionLocal() as db:
        payment_service.authorize_payment(
            db,
            uuid.UUID(payment_id),
            payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"),
        )
        payment_service.capture_payment(db, uuid.UUID(payment_id))
        db.commit()

    barrier = threading.Barrier(parallelism)
    results = []

    def worker(index: int):
        barrier.wait()
        amount = 2000
        result = _refund(payment_id, amount, f"refund-{uuid.uuid4()}")
        results.append(result)

    with ThreadPoolExecutor(max_workers=parallelism) as pool:
        list(pool.map(worker, range(parallelism)))

    with SessionLocal() as db:
        payment = payment_service.get_payment(db, uuid.UUID(payment_id))
        invariants = verify_payment_invariants(db, [payment_id])

    return {
        "scenario": "concurrent_refunds",
        "parallel_requests": parallelism,
        "trials": len(results),
        "conflicts": sum(1 for item in results if item.get("status") == "skipped"),
        "duplicate_financial_effects": max(0, payment.refunded_amount - payment.captured_amount),
        "final_status": payment.status,
        "refunded_amount": payment.refunded_amount,
        "captured_amount": payment.captured_amount,
        "invariants": invariants,
    }


def run_conflicting_operations(parallelism: int = 15):
    payment_id = _create_record(30000, f"conflict-{uuid.uuid4()}")
    with SessionLocal() as db:
        payment_service.authorize_payment(
            db,
            uuid.UUID(payment_id),
            payment_service.AuthorizePaymentRequest(processor_outcome="APPROVED"),
        )
        payment_service.capture_payment(db, uuid.UUID(payment_id))
        db.commit()

    barrier = threading.Barrier(parallelism)
    conflicts = 0
    duplicate_effects = 0
    results = []

    def worker(index: int):
        nonlocal conflicts, duplicate_effects
        barrier.wait()
        try:
            with SessionLocal() as db:
                if index % 2 == 0:
                    payment_service.refund_payment(
                        db,
                        uuid.UUID(payment_id),
                        payment_service.RefundRequest(amount=5000, idempotency_key=f"conflict-{uuid.uuid4()}"),
                    )
                else:
                    payment_service.capture_payment(db, uuid.UUID(payment_id))
            results.append("ok")
        except Exception:
            conflicts += 1
            results.append("conflict")

    with ThreadPoolExecutor(max_workers=parallelism) as pool:
        list(pool.map(worker, range(parallelism)))

    with SessionLocal() as db:
        payment = payment_service.get_payment(db, uuid.UUID(payment_id))
        invariants = verify_payment_invariants(db, [payment_id])

    if payment.refunded_amount > payment.captured_amount:
        duplicate_effects = payment.refunded_amount - payment.captured_amount

    return {
        "scenario": "conflicting_operations",
        "parallel_requests": parallelism,
        "trials": len(results),
        "conflicts": conflicts,
        "duplicate_financial_effects": duplicate_effects,
        "final_status": payment.status,
        "refunded_amount": payment.refunded_amount,
        "captured_amount": payment.captured_amount,
        "invariants": invariants,
    }


def main() -> None:
    summary = {
        "duplicate_creation": run_duplicate_creation(20),
        "simultaneous_capture": run_simultaneous_capture(25),
        "concurrent_refunds": run_concurrent_refunds(20),
        "conflicting_operations": run_conflicting_operations(15),
    }
    out_path = RAW_RESULTS_DIR / "postgres_concurrency_stress.json"
    out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    import uuid
    main()
