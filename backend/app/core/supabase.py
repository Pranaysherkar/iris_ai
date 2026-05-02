from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """
    Singleton Supabase client for backend/server operations.
    Uses service role key and must never be exposed to frontend code.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
