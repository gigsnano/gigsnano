"""Pure helpers for the mobile browser hand-off (RFC 8252 + PKCE S256).

The redirect allowlist is the security boundary: a code is only ever sent to the
app's own scheme, or to Expo Go on a private-network host while that is enabled.
"""

from __future__ import annotations

import base64
import hashlib
import ipaddress
import re

APP_REDIRECT = "gigsnano://auth"

_EXPO_GO = re.compile(r"exp://(?P<host>[A-Za-z0-9.]+)(?::(?P<port>[0-9]{1,5}))?/--/auth")
# Both the PKCE challenge and verifier are 43-128 unreserved base64url characters here.
_PKCE = re.compile(r"[A-Za-z0-9_-]{43,128}")
_PRIVATE_NETWORKS = (
    ipaddress.IPv4Network("127.0.0.1/32"),
    ipaddress.IPv4Network("10.0.0.0/8"),
    ipaddress.IPv4Network("172.16.0.0/12"),
    ipaddress.IPv4Network("192.168.0.0/16"),
)


def _is_private_host(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        addr = ipaddress.IPv4Address(host)  # rejects hostnames, hex and leading zeros
    except ValueError:
        return False
    return any(addr in net for net in _PRIVATE_NETWORKS)


def is_allowed_handoff_redirect(uri: str, allow_expo_go: bool) -> bool:
    """True only for `gigsnano://auth`, or `exp://<private-host>[:port]/--/auth`
    when Expo Go redirects are enabled. Exact match: no query, fragment or userinfo."""
    if uri == APP_REDIRECT:
        return True
    if not allow_expo_go:
        return False
    match = _EXPO_GO.fullmatch(uri)
    if match is None:
        return False
    port = match.group("port")
    if port is not None and not 0 < int(port) <= 65535:
        return False
    return _is_private_host(match.group("host"))


def is_valid_challenge(challenge: str, method: str) -> bool:
    """S256 only; the challenge must be 43-128 unpadded base64url characters."""
    return method == "S256" and _PKCE.fullmatch(challenge) is not None


def is_valid_verifier(verifier: str) -> bool:
    """The verifier must be 43-128 base64url characters (RFC 7636 §4.1, minus `.` and `~`)."""
    return _PKCE.fullmatch(verifier) is not None


def pkce_s256(verifier: str) -> str:
    """base64url(sha256(verifier)) without padding (RFC 7636 §4.2)."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def hash_code(code: str) -> str:
    """The only form of a hand-off code that is ever stored."""
    return hashlib.sha256(code.encode()).hexdigest()
