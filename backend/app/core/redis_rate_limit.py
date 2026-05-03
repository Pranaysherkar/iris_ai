"""Atomic sliding-window rate limit using Redis ZSET + Lua."""

from __future__ import annotations

import time
import uuid

from app.core.redis_client import get_redis_sync

# KEYS[1] = redis key
# ARGV: now (float seconds), window (seconds), limit (int), member id (unique)
_SLIDING_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if tonumber(count) >= tonumber(limit) then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, math.ceil(window) + 2)
return 1
"""


def redis_sliding_allow(redis_key: str, max_requests: int, window_seconds: float) -> bool:
    r = get_redis_sync()
    if r is None:
        return True
    now = time.time()
    cap = max(1, max_requests)
    member = f"{now}:{uuid.uuid4().hex}"
    try:
        allowed = r.eval(
            _SLIDING_LUA,
            1,
            redis_key,
            str(now),
            str(float(window_seconds)),
            str(cap),
            member,
        )
        return bool(int(allowed))
    except Exception:
        # Fail open: do not block chat if Redis is down (monitor Redis separately).
        return True
