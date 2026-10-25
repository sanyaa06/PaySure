import json
import logging
import time
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST

from app.api.v1.endpoints import chaos, health, readiness
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import (
    PaySureException,
    build_error_response,
    paysure_exception_handler,
)
from app.monitoring import get_prometheus_metrics, record_http_request

settings = get_settings()


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id
        if hasattr(record, "event"):
            payload["event"] = record.event
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


logger = logging.getLogger("paysure")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager for startup and graceful shutdown.
    """
    # Startup: Log environment and configurations
    yield
    # Shutdown: Clean up connections if applicable


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Payment reliability, testing, and monitoring platform backend engine.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# --------------------------------------------------------------------------
# Request Tracing & Correlation Middleware
# --------------------------------------------------------------------------
@app.middleware("http")
async def request_tracing_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    route = request.scope.get("route")
    route_name = getattr(route, "path", request.url.path)
    started = time.perf_counter()

    logger.info("request_started", extra={"request_id": request_id, "event": "http.request_started", "route": route_name, "method": request.method})
    try:
        response = await call_next(request)
    except Exception as exc:
        duration = time.perf_counter() - started
        logger.exception("request_failed", extra={"request_id": request_id, "event": "http.request_failed", "route": route_name, "method": request.method, "duration_seconds": duration})
        raise

    duration = time.perf_counter() - started
    response.headers["X-Request-ID"] = request_id
    record_http_request(request.method, route_name, response.status_code, duration)
    logger.info("request_completed", extra={"request_id": request_id, "event": "http.request_completed", "route": route_name, "method": request.method, "status_code": response.status_code, "duration_seconds": duration})
    return response


# --------------------------------------------------------------------------
# CORS Configuration
# --------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# --------------------------------------------------------------------------
# Exception Handlers
# --------------------------------------------------------------------------
app.add_exception_handler(PaySureException, paysure_exception_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Formats Pydantic request validation failures into standard error format."""
    details = {"errors": jsonable_encoder(exc.errors())}
    return build_error_response(
        request=request,
        error_code="VALIDATION_ERROR",
        message="Request payload validation failed.",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        details=details,
    )


@app.exception_handler(Exception)
async def general_unhandled_exception_handler(request: Request, exc: Exception):
    """Guarantees all unexpected runtime exceptions conform to standard error schema."""
    details = {"error_type": type(exc).__name__, "message": str(exc)} if settings.DEBUG else None
    return build_error_response(
        request=request,
        error_code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        details=details,
    )


# --------------------------------------------------------------------------
# Root & Direct Probes
# --------------------------------------------------------------------------
@app.get("/", tags=["Root"])
def root_status():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "phase": "Phase 1: Architecture & Project Foundation",
        "documentation": "/docs",
        "health": "/health",
        "readiness": "/ready",
        "metrics": "/metrics",
        "api_v1": settings.API_V1_STR,
    }


@app.get("/metrics")
def metrics_endpoint() -> Response:
    return Response(content=get_prometheus_metrics(), media_type=CONTENT_TYPE_LATEST)


# Direct /health and /ready routes for orchestration probes
app.include_router(health.router, tags=["Health & Diagnostics"])
app.include_router(readiness.router, tags=["Health & Diagnostics"])
app.include_router(chaos.router, tags=["Chaos Lab"])

# Versioned /api/v1 routes
app.include_router(api_router, prefix=settings.API_V1_STR)
