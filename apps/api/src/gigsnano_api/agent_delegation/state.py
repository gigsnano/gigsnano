"""CSRF/user-binding state for the agent OAuth redirect. HMAC-signed with the
app's JWT secret; 15-minute expiry. Mirrors sync/github_state.py."""

import base64
import hashlib
import hmac
import json
import time

from gigsnano_api.core.config import settings

_MAX_AGE = 900  # 15 min


def _secret() -> bytes:
    return (settings.jwt_secret or "dev-secret-change-me").encode("utf-8")


def sign_agent_state(
    user_id: str,
    provider: str,
    *,
    pkce_verifier: str | None = None,
) -> str:
    body: dict[str, str | int] = {"u": user_id, "p": provider, "t": int(time.time())}
    if pkce_verifier:
        body["k"] = pkce_verifier
    raw = base64.urlsafe_b64encode(json.dumps(body).encode("utf-8")).decode("ascii")
    sig = hmac.new(_secret(), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_agent_state(token: str) -> tuple[str, str, str | None]:
    try:
        raw, sig = token.split(".", 1)
    except ValueError as err:
        raise ValueError("Malformed state") from err
    expected = hmac.new(_secret(), raw.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("Bad state signature")
    body = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")))
    if int(time.time()) - int(body["t"]) > _MAX_AGE:
        raise ValueError("State expired")
    pkce = body.get("k")
    return body["u"], body["p"], pkce if isinstance(pkce, str) else None
