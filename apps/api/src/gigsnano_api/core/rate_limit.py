"""Shared slowapi rate limiter for auth endpoints (GIN-22).

# ponytail: per-process in-memory counters (slowapi's default `MemoryStorage`),
# not shared across instances. If/when Azure scales the API to >1 instance, a
# determined attacker can get up to N x the limit (N = instance count).
# Upgrade to slowapi + Redis storage (`storage_uri=`) at that point, not before
# -- there's no Redis anywhere in this stack today and prod is a single instance.
"""

import json

import jwt
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

from gigsnano_api.auth.deps import ACCESS_COOKIE
from gigsnano_api.core.security import decode_token

# get_remote_address (not get_ipaddr) -- keys strictly off request.client.host,
# which a caller cannot spoof via an X-Forwarded-For/X-Real-IP header. Behind
# the Azure proxy, request.client.host is only trustworthy because uvicorn is
# run with --proxy-headers --forwarded-allow-ips (entrypoint.sh, GIN-22 I3):
# Starlette then rewrites request.client from the trusted XFF itself, so this
# still resolves to the real per-client IP without trusting the header directly.
limiter = Limiter(key_func=get_remote_address)


def user_or_ip_key(request: Request) -> str:
    """Key by the caller's user id (from the access cookie) when signed in,
    else fall back to IP. For endpoints only meaningful to an existing
    session (refresh/change-password) so legitimate multi-user traffic behind
    one IP (offices, NAT) isn't bucketed together."""
    token = request.cookies.get(ACCESS_COOKIE)
    if token:
        try:
            return f"user:{decode_token(token, 'access')}"
        except jwt.InvalidTokenError:
            pass
    return get_remote_address(request)


def ip_email_key(request: Request) -> str:
    """Key by IP+email so repeated forgot-password requests for the SAME
    victim inbox are throttled tightly, independent of the plain per-IP limit.

    # ponytail: reads Starlette's already-cached `request._body` (set by
    # FastAPI's own Pydantic body parsing, which always runs before this
    # decorator's check) instead of a second `await request.body()` -- slowapi
    # key funcs are sync, so this avoids re-plumbing async body access.
    """
    ip = get_remote_address(request)
    body = getattr(request, "_body", None)
    if body:
        try:
            email = json.loads(body).get("email")
        except (ValueError, AttributeError):
            email = None
        if email:
            return f"{ip}:{email}"
    return ip


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    response = JSONResponse(
        {"detail": "Too many requests, try again later."}, status_code=429
    )
    response.headers["Retry-After"] = str(exc.limit.limit.get_expiry())
    return response
