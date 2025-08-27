from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
import datetime

from app.db import models
from app.schemas import schemas
from app.db.database import get_db
from app.api.endpoints import auth
from app.core import ai_engine

router = APIRouter()

class RecommendedSlot(schemas.OrmBaseModel):
    start: datetime.datetime
    end: datetime.datetime
    score: int
    is_recommended: bool

@router.get("/recommend-slots", response_model=List[RecommendedSlot])
async def get_recommended_slots(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    
    if not current_user.customer_profile or not current_user.customer_profile.default_delivery_lat:
        customer_lat = 12.9357
        customer_lon = 77.6245
    else:
        customer_lat = current_user.customer_profile.default_delivery_lat
        customer_lon = current_user.customer_profile.default_delivery_lon

    slots = await ai_engine.recommend_delivery_slots(db=db, customer_lat=customer_lat, customer_lon=customer_lon)
    return slots