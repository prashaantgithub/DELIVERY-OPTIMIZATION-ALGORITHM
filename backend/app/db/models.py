from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Float, func
from sqlalchemy.orm import relationship

from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    phone_number = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    agent_profile = relationship("AgentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    customer_profile = relationship("CustomerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    
    orders_as_customer = relationship("Order", foreign_keys="[Order.customer_id]", back_populates="customer")
    orders_as_agent = relationship("Order", foreign_keys="[Order.agent_id]", back_populates="agent")
    
    availability_slots = relationship("AgentAvailability", back_populates="agent", cascade="all, delete-orphan")
    notifications_received = relationship("Notification", foreign_keys="[Notification.recipient_id]", back_populates="recipient", cascade="all, delete-orphan")
    notifications_sent = relationship("Notification", foreign_keys="[Notification.sender_id]", back_populates="sender", cascade="all, delete-orphan")

class AgentProfile(Base):
    __tablename__ = "agent_profiles"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    performance_score = Column(Integer, default=100)
    total_deliveries_completed = Column(Integer, default=0)
    vehicle_details = Column(String, nullable=True)
    
    user = relationship("User", back_populates="agent_profile")

class CustomerProfile(Base):
    __tablename__ = "customer_profiles"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    default_delivery_address = Column(String, nullable=True)
    default_delivery_lat = Column(Float, nullable=True)
    default_delivery_lon = Column(Float, nullable=True)
    
    user = relationship("User", back_populates="customer_profile")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="pending", nullable=False)
    is_delayed = Column(Boolean, default=False, nullable=False)
    reschedule_attempts = Column(Integer, default=0, nullable=False)
    delivery_address = Column(String, nullable=False)
    delivery_lat = Column(Float, nullable=False)
    delivery_lon = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    delivery_slot_start = Column(DateTime, nullable=False)
    delivery_slot_end = Column(DateTime, nullable=False)
    rating = Column(Integer, nullable=True)
    feedback_text = Column(String, nullable=True)
    
    customer = relationship("User", foreign_keys=[customer_id], back_populates="orders_as_customer")
    agent = relationship("User", foreign_keys=[agent_id], back_populates="orders_as_agent")
    
    events = relationship("DeliveryEvent", back_populates="order", cascade="all, delete-orphan")

class DeliveryEvent(Base):
    __tablename__ = "delivery_events"
    
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    event_type = Column(String, nullable=False)
    reason_code = Column(String, nullable=True)
    details = Column(String, nullable=True)
    location_context = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    order = relationship("Order", back_populates="events")

class AgentAvailability(Base):
    __tablename__ = "agent_availability"
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    is_recurring = Column(Boolean, default=False)
    
    agent = relationship("User", back_populates="availability_slots")

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="notifications_received")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="notifications_sent")