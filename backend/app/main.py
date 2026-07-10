import sys
from pathlib import Path
# Ensure the 'backend' directory is in the Python path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1 import attachments, chat, conversations, speech
from app.middleware.request_id import RequestIdMiddleware


app = FastAPI(
    title=settings.APP_NAME,
    description="Production-Grade AI Chatbot Backend",
    version="1.0.0"
)

# CORS: set CORS_ORIGINS in .env for production (comma-separated). Empty => allow all (*),
# with credentials disabled (browser-safe). Explicit origins enable credentials.
if settings.cors_allow_all:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Conversation-Id", "X-Request-ID"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Conversation-Id", "X-Request-ID"],
    )

# Runs first on incoming requests (registered after CORS).
app.add_middleware(RequestIdMiddleware)

# Include Routers
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])
app.include_router(conversations.router, prefix="/api/v1", tags=["Conversations"])
app.include_router(speech.router, prefix="/api/v1", tags=["Speech"])
app.include_router(attachments.router, prefix="/api/v1", tags=["Attachments"])

@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}


@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
