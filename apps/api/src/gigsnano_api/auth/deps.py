from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.core.security import create_token, decode_mcp_token, decode_token
from gigsnano_api.models.tokens import PersonalAccessToken, hash_token

ACCESS_COOKIE = "gn_access"
REFRESH_COOKIE = "gn_refresh"
# Refresh must be sent to /oauth/authorize (MCP consent) as well as /api/auth/refresh/.
AUTH_COOKIE_PATH = "/"


def set_auth_cookies(response: Response, user_id: str) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        create_token(user_id, "access"),
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        max_age=settings.access_token_ttl_minutes * 60,
        path=AUTH_COOKIE_PATH,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        create_token(user_id, "refresh"),
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        max_age=settings.refresh_token_ttl_days * 86400,
        path=AUTH_COOKIE_PATH,
    )


async def _user_from_bearer(request: Request, db: AsyncSession) -> User | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    presented = auth[len("Bearer "):].strip()

    # MCP OAuth JWT (aud=mcp)
    try:
        claims = decode_mcp_token(presented)
        user = await db.get(User, claims["sub"])
        if user is None or user.is_suspended:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token user")
        return user
    except jwt.InvalidTokenError:
        pass

    # Mobile app access JWT — same signer and claims as the browser access cookie.
    try:
        user_id = decode_token(presented, "access")
    except jwt.InvalidTokenError:
        user_id = None
    if user_id is not None:
        user = await db.get(User, user_id)
        if user is None or user.is_suspended:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token user")
        return user

    # Personal access token
    pat = (
        await db.execute(
            select(PersonalAccessToken).where(
                PersonalAccessToken.token_hash == hash_token(presented)
            )
        )
    ).scalar_one_or_none()
    if pat is None or pat.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked token")
    pat.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    user = await db.get(User, pat.user_id)
    if user is None or user.is_suspended:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token user")
    return user


async def _user_from_pat(request: Request, db: AsyncSession) -> User | None:
    return await _user_from_bearer(request, db)


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        pat_user = await _user_from_pat(request, db)
        if pat_user is not None:
            return pat_user
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return await _user_from_cookie(token, db)


async def get_cookie_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """The web session cookie only; bearer, PAT and MCP tokens are never accepted."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return await _user_from_cookie(token, db)


async def _user_from_cookie(token: str, db: AsyncSession) -> User:
    try:
        user_id = decode_token(token, "access")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    if user.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    return user
