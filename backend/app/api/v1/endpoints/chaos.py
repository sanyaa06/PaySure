from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.chaos import ChaosExperiment, ChaosExperimentEvent, ChaosInvariantResult
from app.schemas.chaos import (
    ChaosExperimentCreateRequest,
    ChaosExperimentDetailResponse,
    ChaosExperimentListResponse,
    ChaosExperimentResponse,
    ChaosExperimentEventResponse,
    ChaosInvariantResultResponse,
    ChaosScenarioResponse,
)
from app.services.chaos_service import execute_experiment, get_experiment_detail, list_experiments, list_scenarios

router = APIRouter(prefix="/chaos")


@router.get("/scenarios", response_model=list[ChaosScenarioResponse])
def get_scenarios() -> list[ChaosScenarioResponse]:
    return [ChaosScenarioResponse(**item) for item in list_scenarios()]


@router.post("/experiments", response_model=ChaosExperimentResponse, status_code=status.HTTP_201_CREATED)
def create_experiment(request: ChaosExperimentCreateRequest, db: Session = Depends(get_db)):
    try:
        experiment = execute_experiment(db, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return ChaosExperimentResponse.model_validate(experiment)


@router.get("/experiments", response_model=ChaosExperimentListResponse)
def list_experiment_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    result = list_experiments(db, limit=limit, offset=offset)
    return ChaosExperimentListResponse(
        items=[ChaosExperimentResponse.model_validate(item) for item in result["items"]],
        total=result["total"],
        limit=result["limit"],
        offset=result["offset"],
    )


@router.get("/experiments/{experiment_id}", response_model=ChaosExperimentDetailResponse)
def get_experiment(experiment_id: UUID, db: Session = Depends(get_db)):
    try:
        experiment = get_experiment_detail(db, experiment_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ChaosExperimentDetailResponse(
        **ChaosExperimentResponse.model_validate(experiment).model_dump(),
        events=[ChaosExperimentEventResponse.model_validate(event) for event in experiment.events],
        invariant_results=[ChaosInvariantResultResponse.model_validate(result) for result in experiment.invariant_results],
    )
