from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")
_secure_random = secrets.SystemRandom()


@dataclass(frozen=True)
class RetryPolicy:
    """Policy for retrying transient failures."""

    max_attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 5.0
    jitter_ratio: float = 0.1

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be at least 1.")
        if self.base_delay_seconds < 0:
            raise ValueError("base_delay_seconds must be non-negative.")
        if self.max_delay_seconds < 0:
            raise ValueError("max_delay_seconds must be non-negative.")
        if self.jitter_ratio < 0:
            raise ValueError("jitter_ratio must be non-negative.")


def classify_retryable_failure(failure: Any) -> bool:
    """Return true for transient failure patterns that are safe to retry."""

    candidate = failure
    if isinstance(candidate, BaseException):
        candidate = str(candidate)

    text = str(candidate).lower()
    retry_markers = (
        "timeout",
        "timed out",
        "temporary outage",
        "temporary",
        "transient",
        "network",
        "connection reset",
        "connection refused",
        "connection aborted",
        "reset by peer",
        "broken pipe",
        "rate limit",
        "too many requests",
        "service unavailable",
        "unavailable",
        "internal error",
        "server error",
        "retry",
        "temporarily",
        "eof",
        "busy",
        "resource temporarily unavailable",
        "overloaded",
        "gateway",
    )
    return any(marker in text for marker in retry_markers)


def execute_with_retry(
    operation: Callable[..., T],
    *args: Any,
    policy: Optional[RetryPolicy] = None,
    **kwargs: Any,
) -> T:
    """Execute an operation with exponential backoff for transient failures."""

    retry_policy = policy or RetryPolicy()
    last_exception: Optional[BaseException] = None

    for attempt in range(1, retry_policy.max_attempts + 1):
        try:
            return operation(*args, **kwargs)
        except Exception as exc:  # pragma: no cover - behavior is exercised through tests
            last_exception = exc
            if attempt >= retry_policy.max_attempts or not classify_retryable_failure(exc):
                raise

            delay = min(
                retry_policy.base_delay_seconds * (2 ** (attempt - 1)),
                retry_policy.max_delay_seconds,
            )
            if retry_policy.jitter_ratio > 0:
                jitter = delay * retry_policy.jitter_ratio * _secure_random.uniform(-1.0, 1.0)
                delay = max(0.0, delay + jitter)
            time.sleep(delay)

    if last_exception is not None:
        raise last_exception
    raise RuntimeError("Retry loop ended without executing the operation.")
