from fastapi import APIRouter
from app.api.v1.endpoints import chaos, health, monitoring, payments, readiness

api_router = APIRouter()

# Register core health & diagnostic routes under /api/v1
api_router.include_router(health.router, tags=["Health & Diagnostics"])
api_router.include_router(readiness.router, tags=["Health & Diagnostics"])
api_router.include_router(payments.router, tags=["Payments"])
api_router.include_router(chaos.router, tags=["Chaos Lab"])
api_router.include_router(monitoring.router, tags=["Monitoring"])
