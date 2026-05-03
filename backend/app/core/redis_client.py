"""Optional Redis connection for shared rate limiting across workers."""

from __future__ import annotations

from typing import Optional

from app.core.config import settings

_redis = None


def get_redis_sync():
    """Returns a redis.Redis client or None if REDIS_URL is not configured."""
    global _redis
    if not settings.REDIS_URL:
        return None
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis
