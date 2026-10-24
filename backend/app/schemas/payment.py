from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SUPPORTED_CURRENCIES = {"INR", "USD", "EUR"}


class PaymentCreateRequest(BaseModel):
    amount: int = Field(..., gt=0, description="Amount in minor units.")
    currency: str = Field(..., min_length=3, max_length=3)
    idempotency_key: str = Field(..., min_length=1, max_length=128)
    client_id: Optional[str] = Field(default=None, max_length=64)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, currency: str) -> str:
        normalized = currency.upper()
        if normalized not in SUPPORTED_CURRENCIES:
            raise ValueError("Unsupported currency. Supported values are INR, USD, and EUR.")
        return normalized

    @field_validator("idempotency_key")
    @classmethod
    def sanitize_idempotency_key(cls, value: str) -> str:
        key = value.strip()
        if not key:
            raise ValueError("idempotency_key cannot be empty.")
        return key


class AuthorizePaymentRequest(BaseModel):
    processor_outcome: Optional[str] = Field(default="APPROVED", description="Deterministic processor outcome. Supports APPROVED or DECLINED.")

    @field_validator("processor_outcome")
    @classmethod
    def validate_processor_outcome(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.upper()
        if normalized not in {"APPROVED", "DECLINED"}:
            raise ValueError("processor_outcome must be APPROVED or DECLINED.")
        return normalized


class RefundRequest(BaseModel):
    amount: int = Field(..., gt=0, description="Amount to refund in minor units.")


class PaymentEventResponse(BaseModel):
    id: UUID
    payment_id: UUID
    event_type: str
    previous_status: Optional[str] = None
    new_status: str
    event_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentResponse(BaseModel):
    id: UUID
    payment_id: UUID
    amount: int
    currency: str
    status: str
    idempotency_key: str
    captured_amount: int = 0
    refunded_amount: int = 0
    client_id: Optional[str] = None
    request_hash: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def set_payment_id(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data = dict(data)
            if "payment_id" not in data and "id" in data:
                data["payment_id"] = data["id"]
        return data

    model_config = ConfigDict(from_attributes=True)


class PaymentListResponse(BaseModel):
    items: List[PaymentResponse]
    total: int
    limit: int
    offset: int


class PaymentCreateResponse(PaymentResponse):
    message: str = "Payment created successfully."
