from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict
from sqlalchemy import func, case
import datetime

from app.db import crud, models
from app.schemas import schemas
from app.db.database import get_db
from app.api.endpoints import auth
from app.core import ai_engine

router = APIRouter()

RECOVERABLE_FAILURE_REASONS = ["CUSTOMER_UNAVAILABLE", "UNABLE_TO_LOCATE_ADDRESS"]

@router.get("/me/orders", response_model=List[schemas.Order])
def read_my_orders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_agent)
):
    orders = crud.get_orders_by_agent(db, agent_id=current_user.id)
    return orders

@router.get("/me/analytics", response_model=schemas.AgentAnalytics)
def get_my_analytics(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_agent)
):
    now = datetime.datetime.utcnow()
    last_7_days_start = now - datetime.timedelta(days=7)
    prev_7_days_start = now - datetime.timedelta(days=14)

    recent_orders_q = db.query(models.Order).filter(
        models.Order.agent_id == current_user.id,
        models.Order.created_at >= prev_7_days_start
    )
    all_agent_orders = crud.get_orders_by_agent(db, agent_id=current_user.id)
    
    total = len(all_agent_orders)
    successful = sum(1 for o in all_agent_orders if o.status == 'delivered')
    failed_deliveries = sum(1 for o in all_agent_orders if o.status == 'failed')
    
    avg_rating_query = db.query(func.avg(models.Order.rating)).filter(
        models.Order.agent_id == current_user.id, models.Order.rating != None
    ).scalar()

    failure_reasons = {}
    failed_orders = [o for o in all_agent_orders if o.status == 'failed']
    for order in failed_orders:
        failure_event = db.query(models.DeliveryEvent).filter(
            models.DeliveryEvent.order_id == order.id,
            models.DeliveryEvent.event_type == 'failure'
        ).first()
        if failure_event:
            reason = failure_event.reason_code or 'UNKNOWN'
            failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
    
    cancellation_events = db.query(
        models.DeliveryEvent.reason_code,
        func.count(models.DeliveryEvent.id)
    ).join(models.Order).filter(
        models.Order.agent_id == current_user.id,
        models.DeliveryEvent.event_type == 'cancellation',
        models.DeliveryEvent.reason_code.isnot(None)
    ).group_by(models.DeliveryEvent.reason_code).all()
    customer_reschedule_reasons = {reason: count for reason, count in cancellation_events}

    success_last_7 = recent_orders_q.filter(models.Order.created_at >= last_7_days_start)\
        .with_entities(func.sum(case((models.Order.status == 'delivered', 1), else_=0)), func.count(models.Order.id)).first()
    
    success_prev_7 = recent_orders_q.filter(models.Order.created_at < last_7_days_start)\
        .with_entities(func.sum(case((models.Order.status == 'delivered', 1), else_=0)), func.count(models.Order.id)).first()

    rate_last_7 = (success_last_7[0] / success_last_7[1]) * 100 if success_last_7[1] and success_last_7[0] is not None else 0
    rate_prev_7 = (success_prev_7[0] / success_prev_7[1]) * 100 if success_prev_7[1] and success_prev_7[0] is not None else 0

    trend = None
    if rate_prev_7 > 0:
        trend = ((rate_last_7 - rate_prev_7) / rate_prev_7) * 100
    elif rate_last_7 > 0:
        trend = 100.0

    in_progress_events = db.query(func.date(models.DeliveryEvent.created_at)).filter(
        models.DeliveryEvent.event_type == 'status_update',
        models.DeliveryEvent.reason_code == 'in_progress',
        models.DeliveryEvent.order.has(agent_id=current_user.id)
    ).distinct().all()
    
    work_days_count = len(in_progress_events)
    total_pickups = len(in_progress_events)
    avg_pickups = total_pickups / work_days_count if work_days_count > 0 else 0

    return schemas.AgentAnalytics(
        total_deliveries=total,
        successful_deliveries=successful,
        failed_deliveries=failed_deliveries,
        average_rating=round(avg_rating_query, 2) if avg_rating_query else None,
        failure_reason_counts=failure_reasons,
        success_rate_trend_percentage=round(trend, 2) if trend is not None else None,
        average_pickups_per_day=round(avg_pickups, 1) if avg_pickups else 0,
        customer_reschedule_reasons=customer_reschedule_reasons
    )

@router.post("/orders/{order_id}/report-event", response_model=schemas.DeliveryEvent)
async def report_delivery_event(
    order_id: int,
    event_type: str,
    reason_code: str,
    details: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_agent)
):
    order = crud.get_order(db, order_id=order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this order")
    
    order_update = schemas.OrderUpdate()
    
    event = crud.create_delivery_event(db=db, event_type=event_type, reason_code=reason_code, details=details, order_id=order.id)

    if event_type == "failure":
        ai_engine.update_agent_score(db, agent_id=current_user.id, event_key=reason_code)
        
        phoenix_protocol_triggered = False
        if reason_code in RECOVERABLE_FAILURE_REASONS and order.reschedule_attempts < 1:
            slots = await ai_engine.recommend_delivery_slots(db, customer_lat=order.delivery_lat, customer_lon=order.delivery_lon, is_recovery_mode=True)
            if slots:
                best_slot = slots[0]
                order_update.status = "rescheduled"
                order_update.is_delayed = False
                order_update.reschedule_attempts = 1
                order_update.delivery_slot_start = best_slot['start']
                order_update.delivery_slot_end = best_slot['end']
                
                ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
                formatted_time = best_slot['start'].astimezone(ist).strftime('%b %d, %I:%M %p - ') + best_slot['end'].astimezone(ist).strftime('%I:%M %p')
                crud.create_notification(db, recipient_id=order.customer_id, order_id=order.id, message=f"We missed you! Order #{order.id} has been automatically rescheduled to {formatted_time}.")
                admin = crud.get_an_admin(db)
                if admin:
                    crud.create_notification(db, recipient_id=admin.id, order_id=order.id, message=f"AI RECOVERY: Order #{order.id} failed ({reason_code}) and was auto-rescheduled.")
                phoenix_protocol_triggered = True

        if not phoenix_protocol_triggered:
            order_update.status = "failed"
                
    elif event_type == "delay_report":
        order_update.is_delayed = True
        ai_engine.update_agent_score(db, agent_id=current_user.id, event_key=reason_code)
        crud.create_notification(db, recipient_id=order.customer_id, order_id=order.id, message=f"Your delivery for order #{order.id} is delayed. Reason: {reason_code}.")
    elif event_type == "delivery":
        order_update.status = "pending_confirmation"
        crud.create_notification(db, recipient_id=order.customer_id, order_id=order.id, message=f"Your order #{order.id} has arrived! Please confirm receipt.")
    elif event_type == "status_update":
        order_update.status = reason_code
    
    crud.update_order(db, order_id=order_id, order_update=order_update)
    return event

@router.post("/availability", response_model=schemas.AgentAvailability)
def set_availability(
    availability: schemas.AgentAvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_agent)
):
    return crud.create_agent_availability(db=db, availability=availability, agent_id=current_user.id)