"""CSRF/workspace-binding state for the GitHub App install redirect (spec §6.3).
HMAC-signed with the app's JWT secret; 15-minute expiry."""

import base64
import hashlib
import hmac
import json
import time

from gigsnano_api.core.config import settings

_MAX_AGE = 900  # 15 min


def _secret() -> bytes:
    return (settings.jwt_secret or "dev-secret-change-me").encode("utf-8")


def sign_state(workspace_slug: str, user_id: str) -> str:
    body = {"ws": workspace_slug, "u": user_id, "t": int(time.time())}
    raw = base64.urlsafe_b64encode(json.dumps(body).encode("utf-8")).decode("ascii")
    sig = hmac.new(_secret(), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_state(token: str) -> tuple[str, str]:
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
    return body["ws"], body["u"]
