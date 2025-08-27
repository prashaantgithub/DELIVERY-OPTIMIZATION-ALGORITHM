from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router

app = FastAPI(
    title="AI-Based Delivery Management System",
    description="This is the backend API for the DMS Hackathon project.",
    version="1.0.0"
)

# CORS (Cross-Origin Resource Sharing) Middleware
# This allows our frontend (running on a different port/domain)
# to communicate with the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For hackathon, allow all origins. In production, restrict this.
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Include the main API router
app.include_router(api_router, prefix="/api")

@app.get("/", tags=["Root"])
def read_root():
    """
    A simple root endpoint to check if the server is running.
    """
    return {"message": "Welcome to the DMS API!"}