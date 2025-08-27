from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine
from app.db import models
from passlib.context import CryptContext
import datetime

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def seed_database():
    db = SessionLocal()
    try:
        print("Seeding database...")

        db.query(models.Notification).delete()
        db.query(models.AgentAvailability).delete()
        db.query(models.DeliveryEvent).delete()
        db.query(models.Order).delete()
        db.query(models.AgentProfile).delete()
        db.query(models.CustomerProfile).delete()
        db.query(models.User).delete()
        db.commit()
        print("Cleared existing data.")

        hashed_password = get_password_hash("password")

        admin_user = models.User(
            email="admin@dmshack.com", full_name="Admin User", hashed_password=hashed_password,
            phone_number="9999999901", role="admin", is_active=True
        )
        db.add(admin_user)

        agent1 = models.User(
            email="agent1@dmshack.com", full_name="Ravi Kumar", hashed_password=hashed_password,
            phone_number="9999999911", role="agent", is_active=True
        )
        agent2 = models.User(
            email="agent2@dmshack.com", full_name="Priya Sharma", hashed_password=hashed_password,
            phone_number="9999999912", role="agent", is_active=True
        )
        db.add_all([agent1, agent2])
        db.flush() 

        agent_profile1 = models.AgentProfile(user_id=agent1.id, vehicle_details="Honda Activa - KA-01-AB-1234", performance_score=95)
        agent_profile2 = models.AgentProfile(user_id=agent2.id, vehicle_details="TVS Jupiter - MH-12-CD-5678", performance_score=105)
        db.add_all([agent_profile1, agent_profile2])
        
        customer1 = models.User(
            email="customer1@dmshack.com", full_name="Arjun Mehta", hashed_password=hashed_password,
            phone_number="9999999921", role="customer", is_active=True
        )
        customer2 = models.User(
            email="customer2@dmshack.com", full_name="Sneha Reddy", hashed_password=hashed_password,
            phone_number="9999999922", role="customer", is_active=True
        )
        db.add_all([customer1, customer2])
        db.flush()

        customer_profile1 = models.CustomerProfile(user_id=customer1.id, default_delivery_address="UB City, Bengaluru", default_delivery_lat=12.9719, default_delivery_lon=77.5954)
        customer_profile2 = models.CustomerProfile(user_id=customer2.id, default_delivery_address="Lalbagh Botanical Garden, Bengaluru", default_delivery_lat=12.9507, default_delivery_lon=77.5848)
        db.add_all([customer_profile1, customer_profile2])

        db.commit()
        print("Users and profiles created.")

        order1 = models.Order(
            customer_id=customer1.id, agent_id=agent1.id, status="delivered",
            delivery_address="Commercial Street, Bengaluru",
            delivery_lat=12.9818, delivery_lon=77.6087,
            delivery_slot_start=datetime.datetime.utcnow() - datetime.timedelta(days=1),
            delivery_slot_end=datetime.datetime.utcnow() - datetime.timedelta(days=1, hours=-1),
            rating=5, feedback_text="Great service!"
        )
        order2 = models.Order(
            customer_id=customer2.id, agent_id=agent1.id, status="failed",
            delivery_address="Phoenix Marketcity, Bengaluru",
            delivery_lat=12.9964, delivery_lon=77.6963,
            delivery_slot_start=datetime.datetime.utcnow() - datetime.timedelta(days=2),
            delivery_slot_end=datetime.datetime.utcnow() - datetime.timedelta(days=2, hours=-1)
        )
        order3 = models.Order(
            customer_id=customer1.id, status="pending",
            delivery_address="Jayanagar 4th Block, Bengaluru",
            delivery_lat=12.9254, delivery_lon=77.5826,
            delivery_slot_start=datetime.datetime.utcnow() + datetime.timedelta(hours=2),
            delivery_slot_end=datetime.datetime.utcnow() + datetime.timedelta(hours=3)
        )
        order4 = models.Order(
            customer_id=customer2.id, status="in_progress", agent_id=agent2.id,
            delivery_address="Indiranagar, Bengaluru",
            delivery_lat=12.9719, delivery_lon=77.6412,
            delivery_slot_start=datetime.datetime.utcnow(),
            delivery_slot_end=datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        )
        db.add_all([order1, order2, order3, order4])
        db.commit()
        print("Orders created.")
        
        event1 = models.DeliveryEvent(
            order_id=order2.id, event_type="failure", reason_code="CUSTOMER_UNAVAILABLE",
            details="Customer did not answer the door."
        )
        db.add(event1)
        db.commit()
        print("Delivery events created.")

        print("Database seeding complete!")

    except Exception as e:
        print(f"An error occurred: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()