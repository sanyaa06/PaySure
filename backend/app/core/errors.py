import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """
    Standardized API error response format for all PaySure services.
    """
    error_code: str = Field(..., description="Machine-readable error classification code")
    message: str = Field(..., description="Human-readable explanation of the error")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Contextual error details or validation violations")
    request_id: str = Field(..., description="Unique trace identifier for request correlation")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of the error event"
    )


class PaySureException(Exception):
    """Base exception for all domain errors within PaySure."""
    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_SERVER_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}


class InvalidStateTransitionError(PaySureException):
    """Raised when an illegal lifecycle state transition is attempted on a Payment."""
    def __init__(self, from_state: str, to_state: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Invalid payment state transition from '{from_state}' to '{to_state}'.",
            error_code="INVALID_STATE_TRANSITION",
            status_code=status.HTTP_409_CONFLICT,
            details=details or {"from_state": from_state, "to_state": to_state}
        )


class DatabaseConnectivityError(PaySureException):
    """Raised when the database connection fails readiness checks."""
    def __init__(self, message: str = "Database connection unavailable", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_code="DATABASE_UNAVAILABLE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details
        )


class ConfigurationError(PaySureException):
    """Raised when application environment configuration is invalid."""
    def __init__(self, message: str):
        super().__init__(
            message=message,
            error_code="CONFIGURATION_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def build_error_response(
    request: Request,
    error_code: str,
    message: str,
    status_code: int,
    details: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    error_payload = ErrorResponse(
        error_code=error_code,
        message=message,
        details=details,
        request_id=request_id,
        timestamp=datetime.now(timezone.utc)
    )
    return JSONResponse(
        status_code=status_code,
        content=error_payload.model_dump(mode="json")
    )


async def paysure_exception_handler(request: Request, exc: PaySureException) -> JSONResponse:
    return build_error_response(
        request=request,
        error_code=exc.error_code,
        message=exc.message,
        status_code=exc.status_code,
        details=exc.details
    )
