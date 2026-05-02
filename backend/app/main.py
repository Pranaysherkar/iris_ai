import sys
from pathlib import Path
# Ensure the 'backend' directory is in the Python path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1 import chat, conversations


app = FastAPI(
    title=settings.APP_NAME,
    description="Production-Grade AI Chatbot Backend",
    version="1.0.0"
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Conversation-Id"],
)

# Include Routers
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])
app.include_router(conversations.router, prefix="/api/v1", tags=["Conversations"])

@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
