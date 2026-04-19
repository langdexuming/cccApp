from fastapi import APIRouter

from app.api.routes.experiments import router as experiments_router
from app.api.routes.health import router as health_router
from app.api.routes.runs import router as runs_router


api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(experiments_router, prefix="/experiments", tags=["experiments"])
api_router.include_router(runs_router, prefix="/runs", tags=["runs"])
