import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.endpoints import health, readiness
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import (
    PaySureException,
    build_error_response,
    paysure_exception_handler,
)

settings = get_settings()


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
    # Extract existing X-Request-ID or generate fresh UUID
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
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
        "api_v1": settings.API_V1_STR,
    }


# Direct /health and /ready routes for orchestration probes
app.include_router(health.router, tags=["Health & Diagnostics"])
app.include_router(readiness.router, tags=["Health & Diagnostics"])

# Versioned /api/v1 routes
app.include_router(api_router, prefix=settings.API_V1_STR)
