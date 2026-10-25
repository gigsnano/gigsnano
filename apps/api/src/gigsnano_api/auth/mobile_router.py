"""Mobile app sign-in: tokens in the response body, never cookies, never sign-up."""

import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.apple import AppleTokenError, verify_apple_identity_token
from gigsnano_api.auth.deps import get_cookie_user
from gigsnano_api.auth.google import GoogleTokenError, verify_google_credential
from gigsnano_api.auth.handoff import (
    hash_code,
    is_allowed_handoff_redirect,
    is_valid_challenge,
    is_valid_verifier,
    pkce_s256,
)
from gigsnano_api.auth.identity import find_user_for_apple, find_user_for_google
from gigsnano_api.auth.mobile_tokens import (
    InvalidRefreshToken,
    issue_token_pair,
    revoke_refresh_family,
    rotate_refresh_token,
)
from gigsnano_api.auth.models import User
from gigsnano_api.auth.router import auth_user_out
from gigsnano_api.auth.schemas import (
    MobileApplePayload,
    MobileAuthOut,
    MobileGooglePayload,
    MobileHandoffCreatePayload,
    MobileHandoffExchangePayload,
    MobileHandoffOut,
    MobileLoginPayload,
    MobileRefreshPayload,
    MobileTokensOut,
)
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.core.rate_limit import limiter, user_or_ip_key
from gigsnano_api.core.security import verify_password
from gigsnano_api.models import MobileHandoffCode

router = APIRouter(prefix="/auth/mobile", tags=["auth-mobile"])

NO_ACCOUNT = {
    "code": "no_account",
    "message": (
        "No GigsNano account matches this sign-in. "
        "Create your workspace at app.gigsnano.com, then sign in here."
    ),
}
INVALID_REFRESH = {"code": "invalid_refresh", "message": "Your session has ended. Sign in again."}
INVALID_REDIRECT = {"code": "invalid_redirect", "message": "Open this page from the GigsNano app."}
INVALID_CHALLENGE = {
    "code": "invalid_challenge",
    "message": "Open this page from the GigsNano app.",
}
INVALID_CODE = {"code": "invalid_code", "message": "That sign-in link expired. Try again."}
HANDOFF_TTL_SECONDS = 120


async def _signed_in(db: AsyncSession, user: User | None, device_name: str) -> MobileAuthOut:
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NO_ACCOUNT)
    if user.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    pair = await issue_token_pair(db, user.id, device_name=device_name)
    await db.commit()
    return MobileAuthOut(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
        user=await auth_user_out(db, user),
    )


@router.post("/login/", response_model=MobileAuthOut)
@limiter.limit("5/minute")
async def mobile_login(
    request: Request, payload: MobileLoginPayload, db: AsyncSession = Depends(get_db)
):
    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if (
        user is None
        or user.password_hash is None
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return await _signed_in(db, user, payload.device_name)


@router.post("/google/", response_model=MobileAuthOut)
@limiter.limit("10/minute")
async def mobile_google(
    request: Request, payload: MobileGooglePayload, db: AsyncSession = Depends(get_db)
):
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in not configured")
    try:
        identity = verify_google_credential(payload.id_token)
    except GoogleTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired Google token")
    if not identity.email_verified:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account email not verified")
    return await _signed_in(db, await find_user_for_google(db, identity), payload.device_name)


@router.post("/apple/", response_model=MobileAuthOut)
@limiter.limit("10/minute")
async def mobile_apple(
    request: Request, payload: MobileApplePayload, db: AsyncSession = Depends(get_db)
):
    if not settings.apple_bundle_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Apple sign-in not configured")
    try:
        identity = verify_apple_identity_token(payload.identity_token)
    except AppleTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired Apple token")
    return await _signed_in(db, await find_user_for_apple(db, identity), payload.device_name)


@router.post("/refresh/", response_model=MobileTokensOut)
@limiter.limit("30/minute")
async def mobile_refresh(
    request: Request, payload: MobileRefreshPayload, db: AsyncSession = Depends(get_db)
):
    try:
        pair = await rotate_refresh_token(db, payload.refresh_token)
    except InvalidRefreshToken:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_REFRESH)
    return MobileTokensOut(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
    )


@router.post("/logout/", status_code=status.HTTP_204_NO_CONTENT)
async def mobile_logout(payload: MobileRefreshPayload, db: AsyncSession = Depends(get_db)):
    await revoke_refresh_family(db, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/handoff/", response_model=MobileHandoffOut)
@limiter.limit("10/minute", key_func=user_or_ip_key)
async def mobile_handoff_create(
    request: Request,
    payload: MobileHandoffCreatePayload,
    user: User = Depends(get_cookie_user),
    db: AsyncSession = Depends(get_db),
):
    """Mint a single-use code for the signed-in web user, bound to the app's PKCE
    challenge and redirect URI. Called only on an explicit user click."""
    if not is_valid_challenge(payload.code_challenge, payload.code_challenge_method):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_CHALLENGE)
    if not is_allowed_handoff_redirect(payload.redirect_uri, settings.mobile_handoff_allow_expo_go):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_REDIRECT)
    now = utcnow()
    await db.execute(delete(MobileHandoffCode).where(MobileHandoffCode.expires_at <= now))
    code = secrets.token_urlsafe(32)
    db.add(
        MobileHandoffCode(
            code_hash=hash_code(code),
            user_id=user.id,
            code_challenge=payload.code_challenge,
            redirect_uri=payload.redirect_uri,
            expires_at=now + timedelta(seconds=HANDOFF_TTL_SECONDS),
        )
    )
    await db.commit()
    return MobileHandoffOut(code=code, expires_in=HANDOFF_TTL_SECONDS)


def _same(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _as_utc(value: datetime) -> datetime:
    # sqlite returns naive datetimes for DateTime(timezone=True); Postgres returns aware.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@router.post("/handoff/exchange/", response_model=MobileAuthOut)
@limiter.limit("10/minute")
async def mobile_handoff_exchange(
    request: Request, payload: MobileHandoffExchangePayload, db: AsyncSession = Depends(get_db)
):
    """Trade a hand-off code + PKCE verifier for a mobile token pair. The code is
    deleted (and committed) before verification, so any attempt burns it."""
    row = (
        await db.execute(
            select(MobileHandoffCode)
            .where(MobileHandoffCode.code_hash == hash_code(payload.code))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_CODE)
    user_id, challenge, redirect_uri = row.user_id, row.code_challenge, row.redirect_uri
    expires_at = _as_utc(row.expires_at)
    await db.delete(row)
    await db.commit()
    valid = (
        expires_at > utcnow()
        and is_valid_verifier(payload.code_verifier)
        and _same(pkce_s256(payload.code_verifier), challenge)
        and _same(payload.redirect_uri, redirect_uri)
    )
    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_CODE)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_CODE)
    return await _signed_in(db, user, payload.device_name)
