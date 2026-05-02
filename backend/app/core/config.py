from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # App Settings
    APP_NAME: str = "Iris AI"
    DEBUG: bool = True
    
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
