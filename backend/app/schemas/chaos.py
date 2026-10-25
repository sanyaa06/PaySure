from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChaosScenarioResponse(BaseModel):
    id: str
    name: str
    description: str
    failure_type: str
    expected_system_response: str


class ChaosExperimentConfig(BaseModel):
    scenario_id: str = Field(..., min_length=1, max_length=64)
    target_operation: str = Field(default="capture", min_length=1, max_length=64)
    delay_ms: int = Field(default=150, ge=0, le=5000)
    repetition_count: int = Field(default=2, ge=1, le=20)
    concurrency_level: int = Field(default=2, ge=1, le=10)
    maximum_attempts: int = Field(default=3, ge=1, le=5)
    random_seed: Optional[int] = Field(default=None)

    @field_validator("scenario_id")
    @classmethod
    def normalize_scenario_id(cls, value: str) -> str:
        return value.strip().lower().replace(" ", "-")


class ChaosExperimentCreateRequest(ChaosExperimentConfig):
    pass


class ChaosExperimentEventResponse(BaseModel):
    id: UUID
    experiment_id: UUID
    timestamp: datetime
    event_type: str
    description: str
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="event_metadata",
        serialization_alias="metadata",
    )

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ChaosInvariantResultResponse(BaseModel):
    id: UUID
    experiment_id: UUID
    invariant_name: str
    expected_condition: str
    observed_condition: str
    verdict: str
    evidence: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class ChaosExperimentResponse(BaseModel):
    id: UUID
    scenario_id: str
    status: str
    configuration: Dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    final_verdict: Optional[str] = None
    related_payment_ids: List[str] = Field(default_factory=list)
    error_summary: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ChaosExperimentDetailResponse(ChaosExperimentResponse):
    events: List[ChaosExperimentEventResponse] = Field(default_factory=list)
    invariant_results: List[ChaosInvariantResultResponse] = Field(default_factory=list)


class ChaosExperimentListResponse(BaseModel):
    items: List[ChaosExperimentResponse]
    total: int
    limit: int
    offset: int
