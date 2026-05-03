from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    # App Settings
    APP_NAME: str = "Iris AI"
    DEBUG: bool = True

    # CORS: comma-separated origins, e.g. "http://localhost:3000,https://app.example.com"
    # Empty string => allow all origins (dev); set explicit origins in production.
    CORS_ORIGINS: str = ""

    # Chat guardrails (text-only)
    CHAT_MAX_MESSAGE_CHARS: int = 32_000
    CHAT_MAX_MESSAGES_PER_REQUEST: int = 50
    """Approximate max input tokens (history + system) before trimming oldest turns."""
    CHAT_MAX_CONTEXT_TOKENS_ESTIMATE: int = 12_000
    CHAT_MEMORY_WINDOW: int = 20

    # Optional override for system prompt; if unset, app.core.prompts default is used.
    CHAT_SYSTEM_PROMPT: Optional[str] = None

    # HTTP client timeouts (seconds)
    SUPABASE_HTTP_TIMEOUT_SECONDS: float = 30.0
    """Groq streaming can run long; raise this if users see read timeouts mid-stream."""
    GROQ_HTTP_TIMEOUT_SECONDS: float = 300.0

    # Per-user chat rate limit (sliding 60s window). Set to 0 to disable.
    CHAT_RATE_LIMIT_PER_MINUTE: int = 45

    # Shared rate limit across workers (optional). If unset, in-memory limiter is used.
    REDIS_URL: Optional[str] = None

    # Optional OpenAI Moderations API for user messages (requires OPENAI_API_KEY).
    CHAT_MODERATION_ENABLED: bool = False
    CHAT_MODERATION_MODEL: str = "omni-moderation-latest"
    OPENAI_API_KEY: Optional[str] = None

    # After the first user message + first assistant reply, call the LLM to set a short sidebar title.
    CHAT_AI_TITLE_ENABLED: bool = True
    CHAT_TITLE_MAX_WORDS: int = 4

    @property
    def cors_origin_list(self) -> List[str]:
        parts = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return parts

    @property
    def cors_allow_all(self) -> bool:
        return len(self.cors_origin_list) == 0
    
    # Supabase Settings
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    
    # Qdrant Settings
    QDRANT_URL: str
    QDRANT_API_KEY: str
    
    # AI Provider Settings
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    
    # AI Parameters
    AI_TEMPERATURE: float = 0.7
    AI_MAX_TOKENS: int = 2048
    AI_TOP_P: float = 0.9
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
