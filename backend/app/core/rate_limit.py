"""
In-memory sliding-window rate limiting (per-process).

Multiple uvicorn workers each maintain separate counters; use a shared store (e.g. Redis)
if you need a global limit across replicas.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict


class SlidingWindowRateLimiter:
    def __init__(self, window_seconds: float) -> None:
        self.window_seconds = float(window_seconds)
        self._lock = Lock()
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def allow(self, key: str, max_requests: int) -> bool:
        cap = max(1, max_requests)
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window_seconds:
                q.popleft()
            if len(q) >= cap:
                return False
            q.append(now)
            return True
