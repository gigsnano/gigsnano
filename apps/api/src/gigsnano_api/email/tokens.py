"""Stateless signed tokens for email flows (reset/verify/unsubscribe).

JWT over settings.jwt_secret — no DB table. A `fingerprint` claim binds a token
to mutable state (e.g. the user's password hash) so it self-invalidates."""

import hashlib
from datetime import datetime, timedelta, timezone

import jwt

from gigsnano_api.core.config import settings


class EmailTokenError(Exception):
    """Invalid, expired, wrong-purpose, or fingerprint-mismatched email token."""


def pwh_fingerprint(password_hash: str | None) -> str:
    return hashlib.sha256((password_hash or "").encode()).hexdigest()[:16]


def make_email_token(
    purpose: str,
    user_id: str,
    *,
    ttl_seconds: int,
    fingerprint: str = "",
) -> str:
    payload = {
        "sub": user_id,
        "purpose": purpose,
        "fp": fingerprint,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_email_token(purpose: str, token: str, *, fingerprint: str = "") -> str:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.InvalidTokenError as err:
        raise EmailTokenError(str(err)) from err
    if payload.get("purpose") != purpose:
        raise EmailTokenError("wrong purpose")
    if payload.get("fp", "") != fingerprint:
        raise EmailTokenError("fingerprint mismatch")
    return payload["sub"]
