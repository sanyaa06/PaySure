from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProcessorHealthResponse(BaseModel):
    processor_id: str
    availability: float
    success_rate: float
    circuit_breaker_state: str
    latency_ms: float
    last_success: Optional[str] = None
    last_failure: Optional[str] = None
    supported_currencies: List[str]
    supported_operations: List[str]

    model_config = ConfigDict(from_attributes=True)


class ProcessorOverviewResponse(BaseModel):
    processor_id: str
    display_name: str
    status: str
    availability: float
    success_rate: float
    latency_ms: float
    supported_currencies: List[str]
    supported_operations: List[str]
    last_health_check: Optional[datetime] = None


class RoutingPolicyResponse(BaseModel):
    policy: str
    name: str
    description: str


class RoutingDecisionResponse(BaseModel):
    id: UUID
    payment_id: UUID
    logical_operation_id: str
    processor_id: str
    routing_policy: str
    selection_reason: str
    observed_processor_health: Optional[str] = None
    estimated_latency_ms: Optional[int] = None
    outcome: Optional[str] = None
    actual_latency_ms: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoutingMetricResponse(BaseModel):
    total_decisions: int
    processors: List[ProcessorOverviewResponse]
    policies: List[str]
    benchmark: Dict[str, Any]


class RoutingSimulationRequest(BaseModel):
    scenario: str = Field(default="all_healthy")
    iterations: int = Field(default=25, ge=1, le=200)
    concurrency: int = Field(default=4, ge=1, le=32)


class RoutingSimulationResponse(BaseModel):
    scenario: str
    benchmark: Dict[str, Any]
    processors: List[ProcessorOverviewResponse]
