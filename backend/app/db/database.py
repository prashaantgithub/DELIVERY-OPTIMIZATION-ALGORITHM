from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings # Import our settings object

# Create the SQLAlchemy engine using the DATABASE_URL from our settings
engine = create_engine(settings.DATABASE_URL)

# Each instance of the SessionLocal class will be a new database session.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our ORM models. All our model classes will inherit from this.
Base = declarative_base()

# Dependency to get a DB session in our API endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()