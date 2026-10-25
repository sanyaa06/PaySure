import asyncio
import json
import math
import os
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import httpx

BASE_URL = os.getenv("PAYSURE_BASE_URL", "http://localhost:8000")
RAW_RESULTS_DIR = Path(__file__).resolve().parents[1] / ".." / "docs" / "raw"
RAW_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

CONCURRENCY_LEVELS = [10, 25, 50, 100]


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil((pct / 100.0) * len(ordered)) - 1))
    return ordered[idx]


def safe_json(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    return value


async def run_lifecycle(client: httpx.AsyncClient, index: int) -> tuple[bool, float, str | None]:
    unique = f"bench-{index}-{int(time.time() * 1000)}"
    amount = 3750 + (index % 111) * 25
    started = time.perf_counter()
    try:
        create = await client.post(
            "/api/v1/payments",
            json={"amount": amount, "currency": "USD", "idempotency_key": f"{unique}-create"},
            timeout=15.0,
        )
        if create.status_code != 201:
            return False, time.perf_counter() - started, f"create:{create.status_code}"
        payment = create.json()
        payment_id = payment["payment_id"]

        auth = await client.post(
            f"/api/v1/payments/{payment_id}/authorize",
            json={"processor_outcome": "APPROVED"},
            timeout=15.0,
        )
        if auth.status_code != 200:
            return False, time.perf_counter() - started, f"auth:{auth.status_code}"

        capture = await client.post(f"/api/v1/payments/{payment_id}/capture", timeout=15.0)
        if capture.status_code != 200:
            return False, time.perf_counter() - started, f"capture:{capture.status_code}"

        refund = await client.post(
            f"/api/v1/payments/{payment_id}/refund",
            json={"amount": amount // 2},
            timeout=15.0,
        )
        if refund.status_code != 200:
            return False, time.perf_counter() - started, f"refund:{refund.status_code}"

        retrieve = await client.get(f"/api/v1/payments/{payment_id}", timeout=15.0)
        if retrieve.status_code != 200:
            return False, time.perf_counter() - started, f"get:{retrieve.status_code}"

        return True, time.perf_counter() - started, None
    except Exception as exc:  # pragma: no cover - benchmark harness
        return False, time.perf_counter() - started, str(exc)


async def run_profile(concurrency: int, total_jobs: int) -> dict[str, Any]:
    latencies: list[float] = []
    errors = 0
    start = time.perf_counter()
    sem = asyncio.Semaphore(concurrency)

    async def bounded_task(index: int):
        nonlocal errors
        async with sem:
            success, elapsed, failure = await run_lifecycle(client, index)
            latencies.append(elapsed)
            if not success:
                errors += 1

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        tasks = [asyncio.create_task(bounded_task(i)) for i in range(total_jobs)]
        await asyncio.gather(*tasks)

    elapsed_seconds = max(time.perf_counter() - start, 1e-9)
    total_requests = total_jobs * 5
    summary = {
        "concurrency": concurrency,
        "total_jobs": total_jobs,
        "total_requests": total_requests,
        "elapsed_seconds": round(elapsed_seconds, 4),
        "requests_per_second": round(total_requests / elapsed_seconds, 4),
        "p50_latency_ms": round(percentile(latencies, 50) * 1000, 3),
        "p95_latency_ms": round(percentile(latencies, 95) * 1000, 3),
        "p99_latency_ms": round(percentile(latencies, 99) * 1000, 3),
        "error_rate": round(errors / total_requests, 6),
        "errors": errors,
    }
    return summary


async def main() -> None:
    profile_results: list[dict[str, Any]] = []
    for concurrency in CONCURRENCY_LEVELS:
        total_jobs = max(20, concurrency * 3)
        result = await run_profile(concurrency=concurrency, total_jobs=total_jobs)
        profile_results.append(result)

    output = {"base_url": BASE_URL, "profiles": profile_results}
    out_path = RAW_RESULTS_DIR / "http_load_profiles.json"
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
