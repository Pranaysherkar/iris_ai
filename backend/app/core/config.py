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
    CHAT_MEMORY_WINDOW: int = 30

    # Query preprocessing (spell map + follow-up rewrite before routing).
    QUERY_PREPROCESSOR_ENABLED: bool = True
    # Long-term facts across conversations (user_facts table).
    USER_FACTS_ENABLED: bool = True
    USER_FACTS_CACHE_TTL_SECONDS: int = 60
    # Rolling bullet summary on conversations.summary column.
    CONVERSATION_SUMMARY_ENABLED: bool = True

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
    """If true, allow chat when the Moderations API is down or rate-limited (logs a warning)."""
    CHAT_MODERATION_FAIL_OPEN: bool = True
    OPENAI_API_KEY: Optional[str] = None

    # --- Tool calls (live data pipeline) ---
    TOOLS_ENABLED: bool = True
    """Minimum confidence (0–1) from rules/router before invoking a tool."""
    TOOL_INTENT_CONFIDENCE_THRESHOLD: float = 0.85
    OLLAMA_API_KEY: Optional[str] = None
    OLLAMA_WEB_SEARCH_BASE_URL: str = "https://ollama.com"
    TOOL_HTTP_TIMEOUT_SECONDS: float = 30.0
    OPEN_METEO_GEOCODING_URL: str = "https://geocoding-api.open-meteo.com/v1/search"
    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    TOOL_DATETIME_ENABLED: bool = True
    TOOL_WEATHER_ENABLED: bool = True
    TOOL_WEB_SEARCH_ENABLED: bool = False
    TOOL_WEB_FETCH_ENABLED: bool = False
    TOOL_WEB_SEARCH_MAX_RESULTS: int = 5
    TOOL_WIKIPEDIA_ENABLED: bool = True
    TOOL_NEWS_RSS_ENABLED: bool = True
    TOOL_EXCHANGE_RATES_ENABLED: bool = True
    TOOL_USER_MEMORY_ENABLED: bool = True
    WIKIPEDIA_API_URL: str = "https://en.wikipedia.org/w/api.php"
    FRANKFURTER_API_URL: str = "https://api.frankfurter.app"
    TOOL_NEWS_RSS_FEEDS: str = (
        "https://feeds.bbci.co.uk/news/rss.xml,"
        "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"
    )

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

    def news_rss_feed_list(self) -> List[str]:
        return [u.strip() for u in self.TOOL_NEWS_RSS_FEEDS.split(",") if u.strip()]
    
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

    # --- Speech / voice chat ---
    SPEECH_ENABLED: bool = True
    """Primary speech locale (BCP-47). en-IN = Indian English for STT + TTS."""
    SPEECH_LANGUAGE: str = "en-IN"
    SPEECH_HTTP_TIMEOUT_SECONDS: float = 60.0
    SPEECH_SKIP_MODERATION: bool = True
    VOICE_MAX_TOKENS: int = 80
    VOICE_TTS_MIN_SENTENCE_CHARS: int = 10
    VOICE_TOOLS_ENABLED: bool = False
    GROQ_VOICE_MODEL: str = "llama-3.1-8b-instant"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"

    SARVAM_API_KEY: Optional[str] = None
    SARVAM_STT_ENABLED: bool = True
    SARVAM_STT_MODEL: str = "saaras:v3"
    SARVAM_STT_LANGUAGE: str = "en-IN"
    SARVAM_STT_MODE: str = "transcribe"

    SARVAM_TTS_ENABLED: bool = True
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SARVAM_TTS_SPEAKER: str = "shubh"
    SARVAM_TTS_LANGUAGE: str = "en-IN"
    SARVAM_TTS_PACE: float = 1.0
    SARVAM_TTS_TEMPERATURE: float = 0.6
    SARVAM_TTS_SAMPLE_RATE: int = 24000
    SARVAM_TTS_OUTPUT_CODEC: str = "wav"

    TTS_FALLBACK_EDGE_ENABLED: bool = True
    EDGE_TTS_VOICE: str = "en-IN-PrabhatNeural"
    EDGE_TTS_RATE: str = "+0%"

    @property
    def sarvam_configured(self) -> bool:
        key = (self.SARVAM_API_KEY or "").strip()
        return bool(key) and key not in ("your-sarvam-key", "your_api_key_here")

    @property
    def speech_stt_language(self) -> str:
        return (self.SPEECH_LANGUAGE or self.SARVAM_STT_LANGUAGE or "en-IN").strip()

    @property
    def speech_tts_language(self) -> str:
        return (self.SPEECH_LANGUAGE or self.SARVAM_TTS_LANGUAGE or "en-IN").strip()

    @property
    def speech_stt_mode(self) -> str:
        """English-only uses transcribe; codemix/translate only for non-English locales."""
        lang = self.speech_stt_language.lower()
        if lang.startswith("en"):
            return "transcribe"
        return (self.SARVAM_STT_MODE or "transcribe").strip()

    @property
    def groq_whisper_language(self) -> str | None:
        """ISO-639-1 hint for Groq Whisper fallback."""
        lang = self.speech_stt_language.lower()
        if lang.startswith("en"):
            return "en"
        if lang.startswith("hi"):
            return "hi"
        return None
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
