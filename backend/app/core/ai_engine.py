from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db import models
from app.core import config
import datetime
import httpx
from typing import List

SCORE_WEIGHTS = {
    "DELIVERY_SUCCESS": 5,
    "AGENT_LATE_FOR_PICKUP": -3,
    "AGENT_NO_SHOW": -15,
    "CUSTOMER_UNAVAILABLE": -5,
    "UNABLE_TO_LOCATE_ADDRESS": -3,
    "PACKAGE_DAMAGED": -25,
    "ACCESS_DENIED": -2,
    "HEAVY_TRAFFIC": -2,
    "ROAD_CLOSURE": -1,
    "VEHICLE_BREAKDOWN": -8,
    "INCLEMENT_WEATHER": -1,
    "SYSTEM_DETECTED_DELAY": -5,
    "CUSTOMER_RATING_5": 3,
    "CUSTOMER_RATING_4": 1,
    "CUSTOMER_RATING_3": 0,
    "CUSTOMER_RATING_2": -3,
    "CUSTOMER_RATING_1": -5,
}

async def get_travel_time_millis(start_lat, start_lon, end_lat, end_lon):
    url = "https://graphhopper.com/api/1/route"
    params = [
        ('point', f"{start_lat},{start_lon}"),
        ('point', f"{end_lat},{end_lon}"),
        ('profile', 'car'),
        ('key', config.settings.GRAPHHOPPER_API_KEY),
    ]
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            if data.get('paths'):
                return data['paths'][0]['time']
        except Exception:
            return None
    return None

def update_agent_score(db: Session, agent_id: int, event_key: str, value: int = None):
    agent_profile = db.query(models.AgentProfile).filter(models.AgentProfile.user_id == agent_id).first()
    if agent_profile:
        if event_key == "INCREMENT_DELIVERIES":
             agent_profile.total_deliveries_completed += 1
        else:
            score_change = SCORE_WEIGHTS.get(event_key, 0)
            agent_profile.performance_score += score_change
        db.commit()

def recommend_agent(db: Session, order_id: int):
    top_agents = db.query(models.User)\
        .join(models.AgentProfile)\
        .filter(models.User.role == 'agent', models.User.is_active == True)\
        .order_by(desc(models.AgentProfile.performance_score))\
        .limit(5).all()
        
    if not top_agents:
        return None
    
    max_score = top_agents[0].agent_profile.performance_score
    top_tier_agents = [agent for agent in top_agents if agent.agent_profile.performance_score == max_score]
    
    if len(top_tier_agents) == 1:
        return top_tier_agents[0]
    else:
        return max(top_tier_agents, key=lambda agent: agent.agent_profile.total_deliveries_completed)

async def recommend_delivery_slots(db: Session, customer_lat: float, customer_lon: float, is_recovery_mode: bool = False) -> List[dict]:
    
    warehouse_lat, warehouse_lon = 12.9716, 77.5946
    travel_time_ms = await get_travel_time_millis(warehouse_lat, warehouse_lon, customer_lat, customer_lon)
    
    if travel_time_ms is None:
        return []

    travel_time_delta = datetime.timedelta(milliseconds=travel_time_ms)
    
    slots = []
    
    ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    now_ist = datetime.datetime.now(ist)
    
    if is_recovery_mode:
        now_ist = (now_ist + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    start_hour_ist = 6 
    end_hour_ist = 22  

    for day_offset in range(2):
        for hour in range(start_hour_ist, end_hour_ist):
            
            slot_start_ist = (now_ist + datetime.timedelta(days=day_offset)).replace(hour=hour, minute=0, second=0, microsecond=0)
            
            cutoff_time = slot_start_ist - travel_time_delta

            if slot_start_ist > now_ist and now_ist < cutoff_time:
                slots.append({
                    "start": slot_start_ist,
                    "end": slot_start_ist + datetime.timedelta(hours=1),
                    "score": 100 
                })

    upcoming_orders = db.query(models.Order).filter(models.Order.status.in_(['pending', 'assigned', 'in_progress'])).all()
    
    one_day_ago = now_ist - datetime.timedelta(days=1)
    recent_failures = db.query(models.DeliveryEvent).filter(
        models.DeliveryEvent.event_type == 'failure',
        models.DeliveryEvent.created_at > one_day_ago
    ).all()

    for slot in slots:
        orders_in_slot = sum(1 for order in upcoming_orders if slot['start'] <= order.delivery_slot_start.replace(tzinfo=ist) < slot['end'])
        density_penalty = orders_in_slot * 10
        slot['score'] -= density_penalty

        for failure in recent_failures:
            failure_time_ist = failure.created_at.replace(tzinfo=ist)
            if failure.reason_code == 'HEAVY_TRAFFIC' and failure_time_ist.hour == slot['start'].hour:
                slot['score'] -= 20

    slots.sort(key=lambda x: (x['score'], x['start'].timestamp()))
    
    if slots:
        slots[0]['is_recommended'] = True
        for i in range(1, len(slots)):
            slots[i]['is_recommended'] = False
            
    utc_slots = []
    for slot in slots:
        utc_slots.append({
            "start": slot['start'].astimezone(datetime.timezone.utc),
            "end": slot['end'].astimezone(datetime.timezone.utc),
            "score": slot['score'],
            "is_recommended": slot.get('is_recommended', False)
        })
            
    return utc_slots[:5]