"""Verify Sign in with Apple identity tokens (RS256, Apple's published JWKS)."""

from dataclasses import dataclass

import jwt

from gigsnano_api.core.config import settings

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

# Module-level so the fetched keys are cached across requests.
_jwks_client = jwt.PyJWKClient(APPLE_JWKS_URL, cache_keys=True)


@dataclass(frozen=True)
class AppleIdentity:
    sub: str
    email: str | None
    email_verified: bool


class AppleTokenError(Exception):
    """Raised when an Apple identity token fails verification."""


def verify_apple_identity_token(token: str) -> AppleIdentity:
    """Raises RuntimeError if apple_bundle_id is unset, AppleTokenError if the token is bad."""
    if not settings.apple_bundle_id:
        raise RuntimeError("apple_bundle_id is not configured")
    try:
        key = _jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.apple_bundle_id,
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:  # bad signature, aud, iss, expiry, JWKS fetch failure
        raise AppleTokenError(str(exc)) from exc
    verified = claims.get("email_verified")
    return AppleIdentity(
        sub=claims["sub"],
        email=claims.get("email"),
        email_verified=verified is True or verified == "true",
    )
