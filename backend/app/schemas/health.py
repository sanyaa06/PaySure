from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness probe response model."""
    status: str = Field(default="healthy", description="Application service status")
    version: str = Field(..., description="Application version")
    environment: str = Field(..., description="Runtime environment")
    timestamp: datetime = Field(..., description="UTC timestamp of the probe")


class ReadinessResponse(BaseModel):
    """Readiness probe response model for database connectivity."""
    status: str = Field(default="ready", description="Overall readiness status")
    database: str = Field(default="connected", description="PostgreSQL connectivity state")
    timestamp: datetime = Field(..., description="UTC timestamp of the probe")
    latency_ms: Optional[float] = Field(default=None, description="Round-trip database query latency in milliseconds")


class UnreadyResponse(BaseModel):
    """Response returned when service dependencies fail readiness checks."""
    status: str = Field(default="unready", description="Unready status flag")
    database: str = Field(default="disconnected", description="Database status")
    error: str = Field(..., description="Description of the dependency failure")
    timestamp: datetime = Field(..., description="UTC timestamp of the probe")
