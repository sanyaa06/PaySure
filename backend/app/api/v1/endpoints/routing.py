from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.processor_routing import ProcessorRoutingDecision
from app.schemas.processor_routing import (
    ProcessorOverviewResponse,
    RoutingDecisionResponse,
    RoutingMetricResponse,
    RoutingPolicyResponse,
    RoutingSimulationRequest,
    RoutingSimulationResponse,
)
from app.services.processor_router import benchmark_routing_strategies, build_default_processors, ProcessorRouter

router = APIRouter(prefix="/routing")


def _processor_rows() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for processor in build_default_processors():
        health = processor.health_check()
        rows.append(
            {
                "processor_id": processor.processor_id,
                "display_name": processor.processor_id.upper(),
                "status": health["circuit_breaker_state"],
                "availability": health["availability"],
                "success_rate": health["success_rate"],
                "latency_ms": health["latency_ms"],
                "supported_currencies": sorted(health["supported_currencies"]),
                "supported_operations": sorted(health["supported_operations"]),
                "last_health_check": None,
            }
        )
    return rows


@router.get("/policies", response_model=list[RoutingPolicyResponse], summary="List routing strategies")
def list_policies() -> list[RoutingPolicyResponse]:
    return [
        RoutingPolicyResponse(
            policy="round_robin",
            name="Round Robin",
            description="Deterministic rotation across eligible processors; safe default for evenly distributed traffic.",
        ),
        RoutingPolicyResponse(
            policy="lowest_latency",
            name="Lowest Latency",
            description="Selects the lowest observed-latency eligible processor while respecting circuit-breaker state.",
        ),
        RoutingPolicyResponse(
            policy="reliability_aware",
            name="Reliability-Aware",
            description="Balances success rate, latency, availability, and circuit health with a weighted rule-based score.",
        ),
    ]


@router.get("/processors", response_model=list[ProcessorOverviewResponse], summary="List available processors")
def list_processors() -> list[ProcessorOverviewResponse]:
    return [ProcessorOverviewResponse(**row) for row in _processor_rows()]


@router.get("/processors/{processor_id}", response_model=ProcessorOverviewResponse, summary="Inspect a processor")
def get_processor(processor_id: str) -> ProcessorOverviewResponse:
    rows = _processor_rows()
    for row in rows:
        if row["processor_id"] == processor_id:
            return ProcessorOverviewResponse(**row)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Processor {processor_id} not found.")


@router.get("/decisions", response_model=list[RoutingDecisionResponse], summary="List routing decisions")
def list_decisions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[RoutingDecisionResponse]:
    rows = (
        db.query(ProcessorRoutingDecision)
        .order_by(ProcessorRoutingDecision.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [RoutingDecisionResponse.model_validate(row) for row in rows]


@router.get("/metrics", response_model=RoutingMetricResponse, summary="Get routing metrics")
def get_metrics(db: Session = Depends(get_db)) -> RoutingMetricResponse:
    rows = _processor_rows()
    benchmark = benchmark_routing_strategies(build_default_processors())
    total_decisions = db.query(ProcessorRoutingDecision).count()
    return RoutingMetricResponse(
        total_decisions=total_decisions,
        processors=[ProcessorOverviewResponse(**row) for row in rows],
        policies=["round_robin", "lowest_latency", "reliability_aware"],
        benchmark=benchmark,
    )


@router.post("/simulations", response_model=RoutingSimulationResponse, summary="Run a benchmark simulation")
def run_simulation(payload: RoutingSimulationRequest) -> RoutingSimulationResponse:
    scenario = payload.scenario
    processors = build_default_processors()
    benchmark = benchmark_routing_strategies(processors, iterations=payload.iterations, concurrency=payload.concurrency)
    return RoutingSimulationResponse(
        scenario=scenario,
        benchmark=benchmark,
        processors=[ProcessorOverviewResponse(**row) for row in _processor_rows()],
    )


@router.get("/health", summary="Legacy processor health endpoint")
def processor_health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "processors": _processor_rows(),
    }
