"""OAuth 2.1 authorization server routes for hosted MCP (discovery, DCR, authorize, token)."""
from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import ACCESS_COOKIE, AUTH_COOKIE_PATH, REFRESH_COOKIE, get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.core.security import create_mcp_token, decode_token
from gigsnano_api.models.oauth import OAuthAuthorizationCode, OAuthClient, OAuthRefreshToken
from gigsnano_api.models.tokens import hash_token

router = APIRouter(tags=["oauth"])

_TEMPLATES = Path(__file__).resolve().parent / "templates"


def _frontend_url() -> str:
    return (settings.frontend_url or settings.app_base_url).rstrip("/")


def base_url(request: Request) -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    return str(request.base_url).rstrip("/")


def _oauth_public_origin(request: Request) -> str:
    """Browser-reachable origin for OAuth/MCP (frontend proxy when split-domain)."""
    public = settings.public_base_url.rstrip("/") if settings.public_base_url else ""
    frontend = settings.frontend_url.rstrip("/") if settings.frontend_url else ""
    if frontend and public and frontend != public:
        return frontend
    if public:
        return public
    return str(request.base_url).rstrip("/")


def _self_url(request: Request) -> str:
    """This request's own URL on the public origin (not the proxy-internal http scheme)."""
    query = f"?{request.url.query}" if request.url.query else ""
    return f"{base_url(request)}{request.url.path}{query}"


def _authorize_url(request: Request) -> str:
    """Authorize URL for sign-in ``next`` and consent return links."""
    query = f"?{request.url.query}" if request.url.query else ""
    return f"{_oauth_public_origin(request)}/oauth/authorize{query}"


@router.get("/.well-known/oauth-protected-resource")
@router.get("/.well-known/oauth-protected-resource/mcp")  # RFC 9728: metadata for the /mcp resource
async def protected_resource(request: Request) -> dict[str, object]:
    origin = _oauth_public_origin(request)
    return {"resource": f"{origin}/mcp", "authorization_servers": [origin]}


@router.get("/.well-known/oauth-authorization-server")
async def authorization_server(request: Request) -> dict[str, object]:
    origin = _oauth_public_origin(request)
    return {
        "issuer": origin,
        "authorization_endpoint": f"{origin}/oauth/authorize",
        "token_endpoint": f"{origin}/oauth/token",
        "registration_endpoint": f"{origin}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["mcp"],
    }


class RegisterPayload(BaseModel):
    client_name: str = "MCP Client"
    redirect_uris: list[str]


@router.post("/oauth/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterPayload, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    if not payload.redirect_uris:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "redirect_uris required")
    client = OAuthClient(
        client_id=f"c_{secrets.token_urlsafe(16)}",
        client_name=payload.client_name,
        redirect_uris=payload.redirect_uris,
    )
    db.add(client)
    await db.commit()
    return {
        "client_id": client.client_id,
        "client_name": client.client_name,
        "redirect_uris": client.redirect_uris,
        "token_endpoint_auth_method": "none",  # nosec B105 - RFC 8414 metadata value
        "grant_types": ["authorization_code", "refresh_token"],
    }


def _validate_params(response_type: str, code_challenge: str, code_challenge_method: str) -> None:
    if response_type != "code" or code_challenge_method != "S256" or not code_challenge:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "unsupported response_type / PKCE required (S256)",
        )


async def _load_client(db: AsyncSession, client_id: str, redirect_uri: str) -> OAuthClient:
    client = (
        await db.execute(select(OAuthClient).where(OAuthClient.client_id == client_id))
    ).scalar_one_or_none()
    if client is None or redirect_uri not in client.redirect_uris:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid client_id or redirect_uri")
    return client


def _user_from_cookie(request: Request) -> str | None:
    # A cold browser navigation to /oauth/authorize doesn't trigger the frontend's
    # access-token refresh, so the 15-min gn_access is often expired here. Fall back
    # to the long-lived refresh cookie to identify the (already logged-in) user for
    # the consent gate — otherwise a valid session bounces to sign-in on every hop.
    for cookie_name, token_type in ((ACCESS_COOKIE, "access"), (REFRESH_COOKIE, "refresh")):
        token = request.cookies.get(cookie_name)
        if not token:
            continue
        try:
            return decode_token(token, token_type)  # type: ignore[arg-type]
        except jwt.InvalidTokenError:
            continue
    return None


_SCOPE_LINES: dict[str, list[str]] = {
    "mcp": [
        "Read your projects and work items",
        "Update story status, assignments, and comments",
        "Access BMAD planning artifacts",
    ],
}


def _scope_list_html(scope: str) -> str:
    lines = _SCOPE_LINES.get(scope, [f"Access scope: {scope}"])
    return "".join(f"<li>{escape(line)}</li>" for line in lines)


def _clear_auth_cookies(response: Response) -> None:
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


def _consent_html(
    client_name: str,
    scope: str,
    params: dict[str, str],
    *,
    user_display: str,
    user_email: str,
    switch_account_url: str,
) -> str:
    template = (_TEMPLATES / "consent.html").read_text(encoding="utf-8")
    hidden = "".join(
        f'<input type="hidden" name="{escape(key)}" value="{escape(value)}">'
        for key, value in params.items()
    )
    return template.format(
        client_name=escape(client_name),
        scope=escape(scope),
        hidden_fields=hidden,
        user_display=escape(user_display),
        user_email=escape(user_email),
        scope_list=_scope_list_html(scope),
        switch_account_url=escape(switch_account_url, quote=True),
    )


@router.get("/oauth/switch-account", response_model=None)
async def switch_account(next: str) -> RedirectResponse:
    """Clear session cookies and send the user back through sign-in (consent flow)."""
    response = RedirectResponse(
        f"{_frontend_url()}/sign-in?" + urlencode({"next": next}),
        status_code=302,
    )
    _clear_auth_cookies(response)
    return response


@router.get("/oauth/authorize", response_model=None)
async def authorize_get(
    request: Request,
    response_type: str,
    client_id: str,
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str = "S256",
    state: str = "",
    scope: str = "mcp",
    db: AsyncSession = Depends(get_db),
) -> Response:
    _validate_params(response_type, code_challenge, code_challenge_method)
    client = await _load_client(db, client_id, redirect_uri)
    authorize_url = _authorize_url(request)
    if _user_from_cookie(request) is None:
        signin = f"{_frontend_url()}/sign-in?" + urlencode({"next": authorize_url})
        return RedirectResponse(signin, status_code=302)
    user_id = _user_from_cookie(request)
    user = await db.get(User, user_id) if user_id else None
    user_display = user.display_name if user else "your account"
    user_email = user.email if user else ""
    switch_url = f"{_oauth_public_origin(request)}/oauth/switch-account?" + urlencode(
        {"next": authorize_url}
    )
    html = _consent_html(
        client.client_name,
        scope,
        dict(request.query_params),
        user_display=user_display,
        user_email=user_email,
        switch_account_url=switch_url,
    )
    return HTMLResponse(html)


@router.post("/oauth/authorize", response_model=None)
async def authorize_post(
    request: Request,
    response_type: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    code_challenge: str = Form(...),
    code_challenge_method: str = Form(default="S256"),
    state: str = Form(default=""),
    scope: str = Form(default="mcp"),
    approve: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    _validate_params(response_type, code_challenge, code_challenge_method)
    await _load_client(db, client_id, redirect_uri)
    user_id = _user_from_cookie(request)
    if user_id is None:
        return RedirectResponse(
            f"{_frontend_url()}/sign-in?" + urlencode({"next": _authorize_url(request)}),
            status_code=302,
        )
    if not approve:
        return RedirectResponse(
            f"{redirect_uri}?" + urlencode({"error": "access_denied", "state": state}),
            status_code=302,
        )
    code = secrets.token_urlsafe(32)
    db.add(
        OAuthAuthorizationCode(
            code=code,
            client_id=client_id,
            user_id=user_id,
            redirect_uri=redirect_uri,
            code_challenge=code_challenge,
            scope=scope,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
            used=False,
        )
    )
    await db.commit()
    return RedirectResponse(
        f"{redirect_uri}?" + urlencode({"code": code, "state": state}),
        status_code=302,
    )


def _pkce_ok(verifier: str, challenge: str) -> bool:
    calc = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return secrets.compare_digest(calc, challenge)


async def _issue_tokens(
    db: AsyncSession, user_id: str, client_id: str, scope: str
) -> dict[str, object]:
    access = create_mcp_token(user_id, client_id, scope)
    refresh = secrets.token_urlsafe(48)
    db.add(
        OAuthRefreshToken(
            token_hash=hash_token(refresh),
            client_id=client_id,
            user_id=user_id,
            scope=scope,
        )
    )
    await db.commit()
    return {
        "access_token": access,
        "token_type": "Bearer",  # nosec B105 - RFC 6749 token_type, not a secret
        "expires_in": settings.mcp_token_ttl_minutes * 60,
        "refresh_token": refresh,
        "scope": scope,
    }


def _is_expired(expires_at: datetime) -> bool:
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at < now


def _token_error(desc: str, code: str = "invalid_grant") -> JSONResponse:
    return JSONResponse({"error": code, "error_description": desc}, status_code=400)


@router.post("/oauth/token")
async def token(
    grant_type: str = Form(...),
    code: str = Form(default=""),
    redirect_uri: str = Form(default=""),
    client_id: str = Form(default=""),
    code_verifier: str = Form(default=""),
    refresh_token: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    if grant_type == "authorization_code":
        row = (
            await db.execute(
                select(OAuthAuthorizationCode).where(OAuthAuthorizationCode.code == code)
            )
        ).scalar_one_or_none()
        if (
            row is None
            or row.used
            or row.client_id != client_id
            or row.redirect_uri != redirect_uri
            or _is_expired(row.expires_at)
        ):
            return _token_error("invalid or expired code")
        if not _pkce_ok(code_verifier, row.code_challenge):
            return _token_error("PKCE verification failed")
        row.used = True
        tokens = await _issue_tokens(db, row.user_id, client_id, row.scope)
        return JSONResponse(tokens)

    if grant_type == "refresh_token":
        row = (
            await db.execute(
                select(OAuthRefreshToken).where(
                    OAuthRefreshToken.token_hash == hash_token(refresh_token),
                    OAuthRefreshToken.revoked_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if row is None or row.client_id != client_id:
            return _token_error("invalid refresh_token")
        row.revoked_at = datetime.now(timezone.utc)
        tokens = await _issue_tokens(db, row.user_id, client_id, row.scope)
        return JSONResponse(tokens)

    return _token_error("unsupported_grant_type", "unsupported_grant_type")


# --- Session-authenticated grant management (mounted under /api for the portal) ---

grants_router = APIRouter(prefix="/oauth", tags=["oauth"])


class OAuthGrantOut(BaseModel):
    client_id: str
    client_name: str
    authorized_at: datetime
    scope: str


@grants_router.get("/grants/", response_model=list[OAuthGrantOut])
async def list_grants(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[OAuthGrantOut]:
    rows = (
        await db.execute(
            select(
                OAuthRefreshToken.client_id,
                OAuthClient.client_name,
                func.min(OAuthRefreshToken.created_at).label("authorized_at"),
                OAuthRefreshToken.scope,
            )
            .join(OAuthClient, OAuthClient.client_id == OAuthRefreshToken.client_id)
            .where(
                OAuthRefreshToken.user_id == user.id,
                OAuthRefreshToken.revoked_at.is_(None),
            )
            .group_by(
                OAuthRefreshToken.client_id,
                OAuthClient.client_name,
                OAuthRefreshToken.scope,
            )
            .order_by(func.min(OAuthRefreshToken.created_at).desc())
        )
    ).all()
    return [
        OAuthGrantOut(
            client_id=row.client_id,
            client_name=row.client_name,
            authorized_at=row.authorized_at,
            scope=row.scope,
        )
        for row in rows
    ]


@grants_router.delete("/grants/{client_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_grant(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    tokens = (
        await db.execute(
            select(OAuthRefreshToken).where(
                OAuthRefreshToken.user_id == user.id,
                OAuthRefreshToken.client_id == client_id,
                OAuthRefreshToken.revoked_at.is_(None),
            )
        )
    ).scalars().all()
    if not tokens:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grant not found")
    now = datetime.now(timezone.utc)
    for token in tokens:
        token.revoked_at = now
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
