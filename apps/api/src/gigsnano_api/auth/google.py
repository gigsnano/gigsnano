"""Direct Google OAuth: verify a Google ID token (no Firebase)."""

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from gigsnano_api.core.config import settings


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str | None
    email_verified: bool
    name: str | None
    picture: str | None


class GoogleTokenError(Exception):
    """Raised when a Google ID token fails verification."""


def verify_google_credential(token: str) -> GoogleIdentity:
    """Verify a Google ID token and return the caller's identity.

    Raises:
        RuntimeError: if google_client_id is not configured.
        GoogleTokenError: if the token is invalid or expired.
    """
    if not settings.google_client_id:
        raise RuntimeError("google_client_id is not configured")
    allowed = {settings.google_client_id} | {
        cid.strip() for cid in settings.google_mobile_client_ids.split(",") if cid.strip()
    }
    try:
        # audience=None: google-auth still checks signature, issuer and expiry; the
        # audience is checked below against every client we own (web, iOS, Android).
        claims = google_id_token.verify_oauth2_token(token, google_requests.Request(), None)
    except ValueError as exc:  # invalid signature, expired, wrong issuer, etc.
        raise GoogleTokenError(str(exc)) from exc
    if claims.get("aud") not in allowed:
        raise GoogleTokenError("Token audience is not a GigsNano client")
    return GoogleIdentity(
        sub=claims["sub"],
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )
