import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import (
    ACCESS_COOKIE,
    AUTH_COOKIE_PATH,
    REFRESH_COOKIE,
    get_current_user,
    set_auth_cookies,
)
from gigsnano_api.auth.google import GoogleTokenError, verify_google_credential
from gigsnano_api.auth.identity import find_user_for_google
from gigsnano_api.auth.models import User
from gigsnano_api.auth.schemas import (
    AuthUserOut,
    ForgotPasswordPayload,
    GoogleAuthPayload,
    ResetPasswordPayload,
    SignInPayload,
    SignUpPayload,
    VerifyEmailPayload,
)
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.core.rate_limit import ip_email_key, limiter, user_or_ip_key
from gigsnano_api.core.security import (
    decode_token,
    hash_password,
    verify_password,
)
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.messages import password_reset_email
from gigsnano_api.email.messages import verify_email as verify_email_msg
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.email.send import send_email_in_background
from gigsnano_api.email.tokens import (
    EmailTokenError,
    make_email_token,
    pwh_fingerprint,
    verify_email_token,
)
from gigsnano_api.models.workspace import EMemberStatus, Workspace, WorkspaceMember

router = APIRouter(prefix="/auth", tags=["auth"])


async def auth_user_out(db: AsyncSession, user: User) -> AuthUserOut:
    """Serialize a user, resolving `last_workspace_slug` against real membership.

    That column is only a last-visited cache, but the frontend routes on it: a
    null sends the user to /onboarding to create a workspace. Every path that
    grants membership would otherwise have to remember to write it, and the ones
    that don't -- a directory add, accepting a pending invite -- strand a member
    on "create a workspace" for a workspace they already belong to. Membership is
    the source of truth, so fall back to it rather than trusting the cache.
    """
    out = AuthUserOut.model_validate(user)
    if out.last_workspace_slug is None:
        workspace = (
            await db.execute(
                select(Workspace)
                .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
                .where(
                    WorkspaceMember.user_id == user.id,
                    WorkspaceMember.status == EMemberStatus.ACTIVE,
                )
                .order_by(Workspace.created_at)
                .limit(1)
            )
        ).scalars().first()
        if workspace is not None:
            out.last_workspace_slug = workspace.slug
    return out


def _queue_verify_email(
    background: BackgroundTasks, provider: EmailProvider, user: User
) -> None:
    if user.email_verified or not user.email:
        return
    token = make_email_token("verify", user.id, ttl_seconds=86400)
    link = f"{settings.app_base_url}/verify-email?token={token}"
    subject, html = verify_email_msg(user.display_name, link)
    background.add_task(send_email_in_background, provider, user.email, subject, html)


@router.post("/sign-up/", response_model=AuthUserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def sign_up(
    request: Request,
    payload: SignUpPayload,
    response: Response,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=payload.email,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    _queue_verify_email(background, provider, user)
    set_auth_cookies(response, user.id)
    return user


@router.post("/sign-in/", response_model=AuthUserOut)
@limiter.limit("5/minute")
async def sign_in(
    request: Request,
    payload: SignInPayload,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if user.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    set_auth_cookies(response, user.id)
    return await auth_user_out(db, user)


@router.post("/google/", response_model=AuthUserOut)
@limiter.limit("10/minute")
async def google_auth(
    request: Request,
    payload: GoogleAuthPayload,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    if not settings.google_client_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in not configured"
        )
    try:
        identity = verify_google_credential(payload.id_token)
    except GoogleTokenError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired Google token"
        )
    if not identity.email:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Email not provided by Google"
        )
    if not identity.email_verified:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Google account email not verified"
        )

    user = await find_user_for_google(db, identity)
    if user is None:
        existing = await db.execute(select(User.id).where(User.email == identity.email))
        if existing.scalar_one_or_none() is not None:
            # Email belongs to an account already linked to a different Google subject.
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account mismatch")
        user = User(
            email=identity.email,
            display_name=identity.name or identity.email.split("@")[0],
            avatar_url=identity.picture,
            google_sub=identity.sub,
            password_hash=None,
            email_verified=True,
        )
        db.add(user)
    if user.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    await db.commit()
    set_auth_cookies(response, user.id)
    return await auth_user_out(db, user)


@router.post("/refresh/", response_model=AuthUserOut)
@limiter.limit("20/minute", key_func=user_or_ip_key)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    try:
        user_id = decode_token(token, "refresh")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    if user.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    set_auth_cookies(response, user.id)  # rotate both tokens
    return await auth_user_out(db, user)


@router.post("/sign-out/", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out(response: Response):
    # The clearing Set-Cookie must carry the SAME attributes the cookies were set
    # with (see set_auth_cookies). In a cross-site deployment the cookies are
    # `SameSite=None; Secure`; a clearing header that omits those attributes is
    # rejected by the browser, so the session cookie survives and the user stays
    # signed in. Mirror secure/samesite/httponly here so deletion actually takes.
    response.delete_cookie(
        ACCESS_COOKIE,
        path=AUTH_COOKIE_PATH,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path=AUTH_COOKIE_PATH,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )


@router.get("/me/", response_model=AuthUserOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await auth_user_out(db, user)


class UpdateAccountPayload(BaseModel):
    display_name: str | None = None
    email_digest: bool | None = None
    product_updates: bool | None = None
    # Set by the hosted-MCP set_active_workspace tool. Stored as-is; default_workspace
    # re-validates it against current membership on read, so a stale slug is harmless.
    mcp_active_workspace_slug: str | None = None


@router.patch("/me/", response_model=AuthUserOut)
async def update_me(
    payload: UpdateAccountPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.display_name is not None and payload.display_name.strip():
        user.display_name = payload.display_name.strip()
    if payload.email_digest is not None:
        user.email_digest = payload.email_digest
    if payload.product_updates is not None:
        user.product_updates = payload.product_updates
    if payload.mcp_active_workspace_slug is not None:
        # Stored as-is; the MCP's default_workspace() re-validates against current
        # membership on read, so an empty string clears it and a stale slug is ignored.
        user.mcp_active_workspace_slug = payload.mcp_active_workspace_slug or None
    await db.commit()
    return await auth_user_out(db, user)


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password/")
@limiter.limit("5/minute", key_func=user_or_ip_key)
async def change_password(
    request: Request,
    payload: ChangePasswordPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.password_hash is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This account signs in with Google and has no password",
        )
    if len(payload.new_password) < 8:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "New password must be at least 8 characters"
        )
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"success": True}


@router.post("/forgot-password/")
@limiter.limit("3/minute", key_func=ip_email_key)
@limiter.limit("10/hour", key_func=ip_email_key)
async def forgot_password(
    request: Request,
    payload: ForgotPasswordPayload,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
):
    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if user is not None and user.password_hash is not None:
        token = make_email_token(
            "reset",
            user.id,
            ttl_seconds=3600,
            fingerprint=pwh_fingerprint(user.password_hash),
        )
        link = f"{settings.app_base_url}/reset-password?token={token}"
        subject, html = password_reset_email(user.display_name, link)
        background.add_task(send_email_in_background, provider, user.email, subject, html)
    return {"ok": True}


@router.post("/reset-password/")
@limiter.limit("10/minute")
async def reset_password(
    request: Request, payload: ResetPasswordPayload, db: AsyncSession = Depends(get_db)
):
    if len(payload.new_password) < 8:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "New password must be at least 8 characters"
        )
    try:
        raw = jwt.decode(
            payload.token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = raw["sub"]
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid token")
    try:
        verify_email_token(
            "reset",
            payload.token,
            fingerprint=pwh_fingerprint(user.password_hash),
        )
    except EmailTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token already used or invalid")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True}


@router.post("/verify-email/request/")
async def request_verify(
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    provider: EmailProvider = Depends(get_email_provider),
):
    _queue_verify_email(background, provider, user)
    return {"ok": True}


@router.post("/verify-email/confirm/")
async def confirm_verify(payload: VerifyEmailPayload, db: AsyncSession = Depends(get_db)):
    try:
        user_id = verify_email_token("verify", payload.token)
    except EmailTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid token")
    user.email_verified = True
    await db.commit()
    return {"ok": True}
