from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import get_settings
from app.schemas.health import HealthResponse

router = APIRouter()
settings = get_settings()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Application liveness probe",
    description="Returns HTTP 200 when the FastAPI application process is alive and responding.",
    tags=["Health & Diagnostics"]
)
def check_health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc)
    )
