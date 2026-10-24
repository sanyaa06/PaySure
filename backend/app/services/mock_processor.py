from __future__ import annotations

from typing import Any, Dict, Optional


def simulate_authorization_outcome(
    payment_id: str,
    requested_outcome: Optional[str] = None,
) -> Dict[str, Any]:
    """Returns a deterministic mock processor result for authorization attempts."""
    decision = (requested_outcome or "APPROVED").upper()
    if decision not in {"APPROVED", "DECLINED"}:
        raise ValueError("Unsupported mock processor outcome. Use APPROVED or DECLINED.")

    if decision == "APPROVED":
        return {
            "processor_id": "mock_processor_primary",
            "status": "SUCCESS",
            "outcome": "APPROVED",
            "error_code": None,
            "payment_id": payment_id,
            "decision_code": "APPROVAL_OK",
        }

    return {
        "processor_id": "mock_processor_primary",
        "status": "FAILED",
        "outcome": "DECLINED",
        "error_code": "CARD_DECLINED",
        "payment_id": payment_id,
        "decision_code": "DECLINED",
    }
