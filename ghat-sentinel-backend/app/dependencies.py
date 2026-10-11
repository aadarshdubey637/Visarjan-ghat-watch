import time
from collections import defaultdict, deque

from fastapi import Request

from app.config import settings
from app.exceptions import RateLimitError

_hits: dict[str, deque] = defaultdict(deque)
_login_failures: dict[str, deque] = defaultdict(deque)
_messaging_hits: dict[str, deque] = defaultdict(deque)
LOGIN_MAX_FAILURES = 5


def reset_rate_limits() -> None:
    _hits.clear()
    _login_failures.clear()
    _messaging_hits.clear()


def reset_messaging_limits() -> None:
    _messaging_hits.clear()


def _login_key(request: Request, email: str) -> str:
    return f"{request.client.host if request.client else 'unknown'}|{email}"


def check_login_allowed(request: Request, email: str) -> None:
    """5 failed attempts per minute per (client ip + email); in-memory, per process."""
    key = _login_key(request, email)
    q = _login_failures[key]
    now = time.monotonic()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= LOGIN_MAX_FAILURES:
        raise RateLimitError("Too many failed login attempts. Please retry in a minute.")
    if not q:
        _login_failures.pop(key, None)


def record_login_failure(request: Request, email: str) -> None:
    _login_failures[_login_key(request, email)].append(time.monotonic())


def clear_login_failures(request: Request, email: str) -> None:
    _login_failures.pop(_login_key(request, email), None)


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


def check_messaging_allowed(user_key: str, count: int) -> None:
    """Per-user sliding hourly window on the number of messages (recipients); in-memory, per process."""
    limit = settings.MESSAGING_MAX_PER_HOUR
    if limit <= 0:
        return
    now = time.monotonic()
    q = _messaging_hits[user_key]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) + count > limit:
        raise RateLimitError("Hourly message limit reached. Please retry later.")
    q.extend([now] * count)
