from functools import lru_cache

from httpx import Timeout
from supabase import Client, ClientOptions, create_client

from app.core.config import settings


def _supabase_client_options() -> ClientOptions:
    t = max(1.0, float(settings.SUPABASE_HTTP_TIMEOUT_SECONDS))
    connect = min(10.0, t)
    timeout = Timeout(connect=connect, read=t, write=t, pool=t)
    ts_int = max(1, int(round(t)))
    return ClientOptions(
        postgrest_client_timeout=timeout,
        storage_client_timeout=ts_int,
        function_client_timeout=ts_int,
    )


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """
    Singleton Supabase client for backend/server operations.
    Uses service role key and must never be exposed to frontend code.
    """
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
        options=_supabase_client_options(),
    )
