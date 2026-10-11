import time
from collections import defaultdict, deque

from fastapi import Request

from app.config import settings
from app.exceptions import RateLimitError

_hits: dict[str, deque] = defaultdict(deque)


def reset_rate_limits() -> None:
    _hits.clear()


def ai_rate_limit(request: Request) -> None:
    """In-memory sliding-window limiter (per client IP, per process)."""
    limit = settings.AI_RATE_LIMIT_PER_MINUTE
    if limit <= 0:
        return
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        raise RateLimitError("Too many AI requests. Please retry in a minute.")
    q.append(now)
