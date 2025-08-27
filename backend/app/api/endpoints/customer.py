from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import httpx
import datetime
from collections import defaultdict

from app.db import crud, models
from app.schemas import schemas
from app.db.database import get_db
from app.api.endpoints import auth
from app.core import ai_engine, config

router = APIRouter()

@router.get("/me/orders", response_model=List[schemas.Order])
def read_my_orders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    orders = crud.get_orders_by_customer(db, customer_id=current_user.id)
    return orders

@router.get("/me/analytics/orders-by-month", response_model=List[schemas.OrdersByMonthAnalytics])
def get_my_orders_by_month_analytics(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    results = crud.get_orders_by_month_for_customer(db, customer_id=current_user.id)
    
    monthly_data = defaultdict(lambda: defaultdict(int))
    for year, month, status, count in results:
        month_str = f"{datetime.date(int(year), int(month), 1).strftime('%b')} {year}"
        
        if status == "delivered":
            monthly_data[month_str]["delivered"] += count
        elif status == "failed":
            monthly_data[month_str]["failed"] += count
        elif status in ["rescheduled", "cancellation"]:
            monthly_data[month_str]["rescheduled"] += count

    analytics_response = []
    for month, statuses in monthly_data.items():
        analytics_response.append(schemas.OrdersByMonthAnalytics(
            month=month,
            statuses=schemas.MonthlyOrderStats(**statuses)
        ))
        
    return analytics_response

@router.get("/orders/{order_id}/route", response_model=List[List[float]])
async def get_order_route(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    order = crud.get_order(db, order_id=order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    start_lat, start_lon = 12.9716, 77.5946
    end_lat, end_lon = order.delivery_lat, order.delivery_lon
    
    url = "https://graphhopper.com/api/1/route"
    
    params = [
        ('point', f"{start_lat},{start_lon}"),
        ('point', f"{end_lat},{end_lon}"),
        ('profile', 'car'),
        ('key', config.settings.GRAPHHOPPER_API_KEY),
        ('points_encoded', 'false')
    ]

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            if not data.get('paths') or len(data['paths']) == 0:
                raise HTTPException(status_code=404, detail="Route could not be calculated by GraphHopper.")
            
            route_coordinates = [[coord[1], coord[0]] for coord in data['paths'][0]['points']['coordinates']]
            if len(route_coordinates) < 2:
                 raise HTTPException(status_code=404, detail="Route is too short to be displayed.")
            return route_coordinates
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from GraphHopper: {e.response.text}")
        except Exception as ex:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {ex}")


@router.post("/orders", response_model=schemas.Order)
def create_new_order(
    order: schemas.OrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    new_order = crud.create_customer_order(db=db, order=order, customer_id=current_user.id)
    
    admin = crud.get_an_admin(db)
    if admin:
        crud.create_notification(
            db=db,
            recipient_id=admin.id,
            order_id=new_order.id,
            message=f"New Order #{new_order.id} has been placed by {current_user.full_name}."
        )
    return new_order

@router.post("/orders/{order_id}/feedback", response_model=schemas.Order)
def submit_order_feedback(
    order_id: int,
    rating: int,
    feedback_text: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    order = crud.get_order(db, order_id=order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to provide feedback for this order")
    
    if order.status != "delivered":
        raise HTTPException(status_code=400, detail="Feedback can only be submitted for delivered orders")
        
    order_update = schemas.OrderUpdate(rating=rating, feedback_text=feedback_text)
    updated_order = crud.update_order(db, order_id=order_id, order_update=order_update)
    
    if updated_order.agent_id:
        event_key = f"CUSTOMER_RATING_{rating}"
        ai_engine.update_agent_score(db, agent_id=updated_order.agent_id, event_key=event_key)

    return updated_order

@router.post("/orders/{order_id}/request-reschedule", response_model=schemas.Order)
async def request_reschedule(
    order_id: int,
    reason: str,
    details: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    order = crud.get_order(db, order_id=order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to act on this order")

    if order.status == "in_progress":
        raise HTTPException(status_code=400, detail="Cannot reschedule an order that is already out for delivery.")
        
    if crud.has_customer_rescheduled(db, order_id=order_id):
        raise HTTPException(status_code=400, detail="This order has already been rescheduled once by you.")

    crud.create_delivery_event(
        db=db, 
        order_id=order_id,
        event_type="cancellation",
        reason_code=reason,
        details=details
    )
    
    slots = await ai_engine.recommend_delivery_slots(db, customer_lat=order.delivery_lat, customer_lon=order.delivery_lon, is_recovery_mode=True)
    if not slots:
        crud.update_order(db, order_id, schemas.OrderUpdate(status="failed"))
        raise HTTPException(status_code=400, detail="AI could not find a suitable reschedule slot. Order has been marked as failed.")

    best_slot = slots[0]
    order_update = schemas.OrderUpdate(
        status="rescheduled",
        is_delayed=False,
        reschedule_attempts=order.reschedule_attempts + 1,
        delivery_slot_start=best_slot['start'],
        delivery_slot_end=best_slot['end']
    )
    updated_order = crud.update_order(db, order_id=order_id, order_update=order_update)
    
    ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    formatted_time = best_slot['start'].astimezone(ist).strftime('%d-%b %I:%M %p')
    
    admin = crud.get_an_admin(db)
    if admin:
        crud.create_notification(db, recipient_id=admin.id, order_id=order.id, message=f"AI ACTION: Customer request for Order #{order.id} was auto-rescheduled to {formatted_time}.")
    if order.agent_id:
        crud.create_notification(db, recipient_id=order.agent_id, order_id=order.id, message=f"UPDATE: Order #{order.id} was rescheduled by the customer to {formatted_time}.")

    return updated_order


@router.post("/orders/{order_id}/confirm", response_model=schemas.Order)
def confirm_delivery(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    order = crud.get_order(db, order_id=order_id)
    if not order or order.customer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found or not authorized.")
    
    if order.status != "pending_confirmation":
        raise HTTPException(status_code=400, detail="Order is not awaiting confirmation.")

    order_update = schemas.OrderUpdate(status="delivered")
    updated_order = crud.update_order(db, order_id, order_update)
    
    if updated_order.agent_id:
        ai_engine.update_agent_score(db, agent_id=updated_order.agent_id, event_key="DELIVERY_SUCCESS")
        ai_engine.update_agent_score(db, agent_id=updated_order.agent_id, event_key="INCREMENT_DELIVERIES")

    return updated_order

@router.post("/orders/{order_id}/dispute", response_model=schemas.Order)
def dispute_delivery(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_customer)
):
    order = crud.get_order(db, order_id=order_id)
    if not order or order.customer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found or not authorized.")
    
    if order.status != "pending_confirmation":
        raise HTTPException(status_code=400, detail="Order is not awaiting confirmation.")

    order_update = schemas.OrderUpdate(status="disputed")
    updated_order = crud.update_order(db, order_id, order_update)

    admin = crud.get_an_admin(db)
    if admin:
        crud.create_notification(db, recipient_id=admin.id, order_id=order.id, message=f"DISPUTE: Customer disputed delivery of Order #{order.id}.")
    if order.agent_id:
        crud.create_notification(db, recipient_id=order.agent_id, order_id=order.id, message=f"DISPUTE: Customer disputed your delivery of Order #{order.id}.")
    
    return updated_order