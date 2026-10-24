import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.health import ReadinessResponse, UnreadyResponse

router = APIRouter()


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    responses={
        200: {"model": ReadinessResponse, "description": "Database connection verified"},
        503: {"model": UnreadyResponse, "description": "Database dependency unavailable"}
    },
    summary="Application readiness probe",
    description="Validates database connectivity by issuing an active ping query (SELECT 1). Returns 503 if disconnected.",
    tags=["Health & Diagnostics"]
)
def check_readiness(db: Session = Depends(get_db)):
    start_time = time.perf_counter()
    try:
        # Issue low-overhead verification query
        db.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        return ReadinessResponse(
            status="ready",
            database="connected",
            timestamp=datetime.now(timezone.utc),
            latency_ms=latency_ms
        )
    except Exception as exc:
        unready_payload = UnreadyResponse(
            status="unready",
            database="disconnected",
            error=str(exc),
            timestamp=datetime.now(timezone.utc)
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=unready_payload.model_dump(mode="json")
        )
