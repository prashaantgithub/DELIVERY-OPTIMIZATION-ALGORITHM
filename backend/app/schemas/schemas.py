from pydantic import BaseModel, EmailStr
import datetime
from typing import List, Optional, Dict

class OrmBaseModel(BaseModel):
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[EmailStr] = None

class AgentProfileBase(BaseModel):
    performance_score: Optional[int] = 100
    vehicle_details: Optional[str] = None

class AgentProfileCreate(AgentProfileBase):
    pass

class AgentProfile(AgentProfileBase, OrmBaseModel):
    user_id: int

class CustomerProfileBase(BaseModel):
    default_delivery_address: Optional[str] = None
    default_delivery_lat: Optional[float] = None
    default_delivery_lon: Optional[float] = None

class CustomerProfileCreate(CustomerProfileBase):
    pass

class CustomerProfile(CustomerProfileBase, OrmBaseModel):
    user_id: int

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone_number: str
    role: str

class UserCreate(UserBase):
    password: str

class User(UserBase, OrmBaseModel):
    id: int
    is_active: bool
    created_at: datetime.datetime
    agent_profile: Optional[AgentProfile] = None
    customer_profile: Optional[CustomerProfile] = None

class AgentAvailabilityBase(BaseModel):
    start_time: datetime.datetime
    end_time: datetime.datetime
    is_recurring: bool = False

class AgentAvailabilityCreate(AgentAvailabilityBase):
    pass

class AgentAvailability(AgentAvailabilityBase, OrmBaseModel):
    id: int
    agent_id: int

class DeliveryEventBase(BaseModel):
    event_type: str
    reason_code: Optional[str] = None
    details: Optional[str] = None
    location_context: Optional[str] = None

class DeliveryEventCreate(DeliveryEventBase):
    pass

class DeliveryEvent(DeliveryEventBase, OrmBaseModel):
    id: int
    order_id: int
    created_at: datetime.datetime

class OrderBase(BaseModel):
    delivery_address: str
    delivery_lat: float
    delivery_lon: float
    delivery_slot_start: datetime.datetime
    delivery_slot_end: datetime.datetime

class OrderCreate(OrderBase):
    pass

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    is_delayed: Optional[bool] = None
    agent_id: Optional[int] = None
    rating: Optional[int] = None
    feedback_text: Optional[str] = None
    delivery_slot_start: Optional[datetime.datetime] = None
    delivery_slot_end: Optional[datetime.datetime] = None
    reschedule_attempts: Optional[int] = None

class Order(OrderBase, OrmBaseModel):
    id: int
    status: str
    is_delayed: bool
    reschedule_attempts: int
    created_at: datetime.datetime
    rating: Optional[int] = None
    feedback_text: Optional[str] = None
    customer: User
    agent: Optional[User] = None
    events: List[DeliveryEvent] = []

class NotificationBase(BaseModel):
    message: str

class Notification(NotificationBase, OrmBaseModel):
    id: int
    is_read: bool
    created_at: datetime.datetime
    recipient_id: int
    sender_id: Optional[int] = None
    order_id: Optional[int] = None

class AgentAnalytics(OrmBaseModel):
    total_deliveries: int
    successful_deliveries: int
    failed_deliveries: int
    average_rating: float | None
    failure_reason_counts: Dict[str, int]
    success_rate_trend_percentage: float | None
    average_pickups_per_day: float | None
    customer_reschedule_reasons: Dict[str, int]

class MonthlyOrderStats(BaseModel):
    delivered: int = 0
    failed: int = 0
    rescheduled: int = 0

class OrdersByMonthAnalytics(BaseModel):
    month: str
    statuses: MonthlyOrderStats

class SuccessRate(BaseModel):
    successful: int
    failed: int

class AgentPerformance(BaseModel):
    full_name: str
    performance_score: int

class DeliveriesByDay(BaseModel):
    day: str
    count: int

class AdminAnalytics(BaseModel):
    success_rate: SuccessRate
    top_agent_failure_reasons: Dict[str, int]
    top_customer_cancellation_reasons: Dict[str, int]
    agent_performance: List[AgentPerformance]
    deliveries_last_7_days: List[DeliveriesByDay]
    peak_hours: Dict[int, int]

class HealthCheckSummary(BaseModel):
    checked_orders: int
    rescheduled_orders: int
    failed_orders: int