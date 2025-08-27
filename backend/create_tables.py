from app.db.database import Base, engine
from app.db import models

print("Dropping all tables if they exist...")
Base.metadata.drop_all(bind=engine)
print("Creating all tables...")
Base.metadata.create_all(bind=engine)
print("Tables created successfully.")