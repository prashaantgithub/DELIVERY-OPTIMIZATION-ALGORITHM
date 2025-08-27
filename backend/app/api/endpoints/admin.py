from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import datetime
import httpx

from app.db import crud, models
from app.schemas import schemas
from app.db.database import get_db
from app.api.endpoints import auth
from app.core import ai_engine, config

router = APIRouter()

POINT_OF_NO_RETURN_BUFFER = datetime.timedelta(minutes=15)
DEPOT_COORDS = "12.9716,77.5946"

@router.get("/orders", response_model=List[schemas.Order])
def read_all_orders(
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    orders = crud.get_orders(db, limit=1000)
    return orders

@router.get("/agents", response_model=List[schemas.User])
def read_all_agents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    agents = db.query(models.User).filter(models.User.role == 'agent').all()
    return agents

@router.post("/system/health-check", response_model=schemas.HealthCheckSummary)
async def perform_system_health_check(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    
    assigned_orders = db.query(models.Order).filter(
        models.Order.status == "assigned",
        models.Order.reschedule_attempts < 1
    ).all()
    
    summary = schemas.HealthCheckSummary(checked_orders=len(assigned_orders), rescheduled_orders=0, failed_orders=0)

    async with httpx.AsyncClient() as client:
        for order in assigned_orders:
            try:
                url = "https://graphhopper.com/api/1/route"
                params = [
                    ('point', DEPOT_COORDS),
                    ('point', f"{order.delivery_lat},{order.delivery_lon}"),
                    ('profile', 'car'),
                    ('key', config.settings.GRAPHHOPPER_API_KEY),
                ]
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                travel_seconds = data['paths'][0]['time'] / 1000
                travel_duration = datetime.timedelta(seconds=travel_seconds)
                
                point_of_no_return = order.delivery_slot_end - travel_duration - POINT_OF_NO_RETURN_BUFFER
                
                if now > point_of_no_return:
                    crud.create_delivery_event(db, 'failure', 'AGENT_NO_SHOW', f"System detected Point of No Return missed at {point_of_no_return.isoformat()}", order.id)
                    ai_engine.update_agent_score(db, agent_id=order.agent_id, event_key="AGENT_NO_SHOW")
                    
                    slots = await ai_engine.recommend_delivery_slots(db, customer_lat=order.delivery_lat, customer_lon=order.delivery_lon, is_recovery_mode=True)
                    if slots:
                        best_slot = slots[0]
                        order_update = schemas.OrderUpdate(
                            status="rescheduled",
                            is_delayed=False,
                            reschedule_attempts=1,
                            delivery_slot_start=best_slot['start'],
                            delivery_slot_end=best_slot['end']
                        )
                        crud.update_order(db, order_id=order.id, order_update=order_update)
                        
                        ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
                        formatted_time = best_slot['start'].astimezone(ist).strftime('%b %d, %I:%M %p')
                        crud.create_notification(db, recipient_id=order.customer_id, order_id=order.id, message=f"Order #{order.id} missed its window and was auto-rescheduled to {formatted_time}.")
                        crud.create_notification(db, recipient_id=current_user.id, order_id=order.id, message=f"AI RECOVERY: Order #{order.id} was auto-rescheduled due to AGENT_NO_SHOW.")
                        summary.rescheduled_orders += 1
                    else:
                        crud.update_order(db, order_id=order.id, order_update=schemas.OrderUpdate(status="failed"))
                        summary.failed_orders += 1

            except Exception as e:
                print(f"Error processing order #{order.id} in health check: {e}")
    
    return summary


@router.get("/system/delayed-orders", response_model=List[schemas.Order])
def get_system_delayed_orders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    now = datetime.datetime.utcnow()
    delayed_orders = db.query(models.Order).filter(
        models.Order.status.in_(['assigned', 'in_progress']),
        models.Order.is_delayed == False,
        models.Order.delivery_slot_end < now
    ).all()
    return delayed_orders

@router.get("/orders/{order_id}/recommend-agent", response_model=schemas.User)
def recommend_agent_for_order(
    order_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    order = crud.get_order(db, order_id=order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    agents = db.query(models.User).filter(models.User.role == 'agent').all()
    if not agents:
        raise HTTPException(status_code=404, detail="No agents available")
    
    best_agent = sorted(agents, key=lambda a: a.agent_profile.performance_score, reverse=True)[0]
    return best_agent

@router.post("/orders/{order_id}/assign-agent", response_model=schemas.Order)
def assign_agent_to_order(
    order_id: int,
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    order_update = schemas.OrderUpdate(agent_id=agent_id, status="assigned")
    updated_order = crud.update_order(db, order_id=order_id, order_update=order_update)
    if not updated_order:
        raise HTTPException(status_code=404, detail="Order not found")

    crud.create_notification(
        db=db,
        recipient_id=agent_id,
        order_id=order_id,
        message=f"You have been assigned a new order: #{order_id}"
    )
    crud.create_notification(
        db=db,
        recipient_id=updated_order.customer_id,
        order_id=order_id,
        message=f"Your order #{order_id} has been assigned to a delivery agent."
    )
    return updated_order

@router.get("/analytics", response_model=schemas.AdminAnalytics)
def get_admin_analytics(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    orders = crud.get_orders(db, limit=5000)
    agents = db.query(models.User).filter(models.User.role == 'agent').all()
    
    successful = sum(1 for o in orders if o.status == 'delivered')
    failed = sum(1 for o in orders if o.status == 'failed')
    success_rate = schemas.SuccessRate(successful=successful, failed=failed)

    failure_reasons = {}
    cancellation_reasons = {}
    for order in orders:
        for event in order.events:
            if event.event_type == 'failure' and event.reason_code:
                failure_reasons[event.reason_code] = failure_reasons.get(event.reason_code, 0) + 1
            elif event.event_type == 'cancellation' and event.reason_code:
                cancellation_reasons[event.reason_code] = cancellation_reasons.get(event.reason_code, 0) + 1
    
    agent_perf = [
        schemas.AgentPerformance(
            full_name=a.full_name,
            performance_score=a.agent_profile.performance_score if a.agent_profile else 100
        ) for a in agents
    ]
    
    today = datetime.date.today()
    deliveries_by_day = {}
    for i in range(7):
        day = today - datetime.timedelta(days=i)
        deliveries_by_day[day.isoformat()] = 0

    for order in orders:
        if order.status == 'delivered':
            order_day = order.created_at.date()
            if order_day.isoformat() in deliveries_by_day:
                deliveries_by_day[order_day.isoformat()] += 1
    
    deliveries_last_7_days = [schemas.DeliveriesByDay(day=k, count=v) for k, v in sorted(deliveries_by_day.items())]

    peak_hours = {h: 0 for h in range(24)}
    for order in orders:
        hour = order.delivery_slot_start.hour
        peak_hours[hour] = peak_hours.get(hour, 0) + 1

    return schemas.AdminAnalytics(
        success_rate=success_rate,
        top_agent_failure_reasons=failure_reasons,
        top_customer_cancellation_reasons=cancellation_reasons,
        agent_performance=sorted(agent_perf, key=lambda a: a.performance_score, reverse=True),
        deliveries_last_7_days=deliveries_last_7_days,
        peak_hours=peak_hours
    )