from fastapi import APIRouter

from app.api.endpoints import auth, admin, agent, customer, ai

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
api_router.include_router(agent.router, prefix="/agent", tags=["Agent"])
api_router.include_router(customer.router, prefix="/customer", tags=["Customer"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI Engine"])