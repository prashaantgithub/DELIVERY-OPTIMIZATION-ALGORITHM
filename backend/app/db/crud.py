from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from . import models
from app.schemas import schemas
from passlib.context import CryptContext
import datetime

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def get_an_admin(db: Session):
    return db.query(models.User).filter(models.User.role == 'admin').first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        phone_number=user.phone_number,
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    if user.role == 'agent':
        agent_profile = models.AgentProfile(user_id=db_user.id)
        db.add(agent_profile)
        db.commit()
        db.refresh(db_user)
    elif user.role == 'customer':
        customer_profile = models.CustomerProfile(user_id=db_user.id)
        db.add(customer_profile)
        db.commit()
        db.refresh(db_user)

    return db_user

def get_order(db: Session, order_id: int):
    return db.query(models.Order).filter(models.Order.id == order_id).first()

def get_orders(db: Session, skip: int = 0, limit: int = 100):
    orders = db.query(models.Order).order_by(models.Order.id.asc()).offset(skip).limit(limit).all()
    now = datetime.datetime.utcnow()

    for order in orders:
        if order.status in ['assigned', 'in_progress'] and not order.is_delayed and now > order.delivery_slot_end:
            order.is_delayed = True
            db.commit()
            db.refresh(order)
            
            existing_event = db.query(models.DeliveryEvent).filter(
                models.DeliveryEvent.order_id == order.id,
                models.DeliveryEvent.event_type == 'delay_report'
            ).first()

            if not existing_event:
                create_delivery_event(db=db, event_type="delay_report", reason_code="UNKNOWN_DELAY", details="Delivery window missed", order_id=order.id)
                
    return orders

def get_orders_by_agent(db: Session, agent_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Order).filter(models.Order.agent_id == agent_id).order_by(models.Order.id.asc()).offset(skip).limit(limit).all()

def get_orders_by_customer(db: Session, customer_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Order).filter(models.Order.customer_id == customer_id).order_by(models.Order.id.asc()).offset(skip).limit(limit).all()

def has_customer_rescheduled(db: Session, order_id: int):
    event = db.query(models.DeliveryEvent).filter(
        models.DeliveryEvent.order_id == order_id,
        models.DeliveryEvent.event_type == 'cancellation'
    ).first()
    return event is not None

def create_customer_order(db: Session, order: schemas.OrderCreate, customer_id: int):
    db_order = models.Order(**order.model_dump(), customer_id=customer_id)
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order

def update_order(db: Session, order_id: int, order_update: schemas.OrderUpdate):
    db_order = get_order(db, order_id)
    if not db_order:
        return None
    
    update_data = order_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_order, key, value)
        
    db.commit()
    db.refresh(db_order)
    return db_order

def create_delivery_event(db: Session, event_type: str, reason_code: str, details: str | None, order_id: int):
    db_event = models.DeliveryEvent(
        order_id=order_id,
        event_type=event_type,
        reason_code=reason_code,
        details=details
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

def create_agent_availability(db: Session, availability: schemas.AgentAvailabilityCreate, agent_id: int):
    db_availability = models.AgentAvailability(**availability.model_dump(), agent_id=agent_id)
    db.add(db_availability)
    db.commit()
    db.refresh(db_availability)
    return db_availability

def get_agent_availability(db: Session, agent_id: int):
    return db.query(models.AgentAvailability).filter(models.AgentAvailability.agent_id == agent_id).all()

def create_notification(db: Session, recipient_id: int, message: str, order_id: int = None, sender_id: int = None):
    db_notification = models.Notification(
        recipient_id=recipient_id,
        message=message,
        order_id=order_id,
        sender_id=sender_id
    )
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def get_notifications(db: Session, user_id: int):
    return db.query(models.Notification).filter(models.Notification.recipient_id == user_id).order_by(models.Notification.created_at.desc()).all()

def mark_notification_as_read(db: Session, notification_id: int, user_id: int):
    db_notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.recipient_id == user_id
    ).first()
    if db_notification:
        db_notification.is_read = True
        db.commit()
        db.refresh(db_notification)
    return db_notification

def get_orders_by_month_for_customer(db: Session, customer_id: int):
    results = db.query(
        extract('year', models.Order.created_at).label('year'),
        extract('month', models.Order.created_at).label('month'),
        models.Order.status,
        func.count(models.Order.id).label('count')
    ).filter(models.Order.customer_id == customer_id).group_by(
        'year', 'month', models.Order.status
    ).order_by('year', 'month').all()

    return results