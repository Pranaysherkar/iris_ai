from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException

from app.core.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.supabase import get_supabase_admin_client

_chat_rate_limiter = SlidingWindowRateLimiter(window_seconds=60.0)


def bearer_token(authorization: Annotated[Optional[str], Header()] = None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return token


def get_current_user_id(access_token: Annotated[str, Depends(bearer_token)]) -> str:
    try:
        supabase = get_supabase_admin_client()
        user_response = supabase.auth.get_user(access_token)
        user = getattr(user_response, "user", None)
        if not user or not getattr(user, "id", None):
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return str(user.id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Token validation failed") from exc


def get_current_user_id_chat_ratelimited(
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> str:
    """Same as get_current_user_id plus per-user sliding-window limit on chat POST."""
    if settings.CHAT_RATE_LIMIT_PER_MINUTE <= 0:
        return user_id
    key = f"chat:{user_id}"
    cap = settings.CHAT_RATE_LIMIT_PER_MINUTE

    if settings.REDIS_URL:
        from app.core.redis_rate_limit import redis_sliding_allow

        if not redis_sliding_allow(f"ratelimit:{key}", cap, 60.0):
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Too many chat requests. Limit is {cap} per minute per account."
                ),
            )
        return user_id

    if not _chat_rate_limiter.allow(key, cap):
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many chat requests. Limit is {cap} per minute per account."
            ),
        )
    return user_id
