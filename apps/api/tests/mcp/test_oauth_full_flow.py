"""End-to-end OAuth 2.1 authorization-code + PKCE flow, no PAT.

register -> authorize(consent) -> token(PKCE) -> JWT bearer -> /mcp initialize+tools.
Mirrors what a real MCP client (Claude, mcp-remote) does after discovery.
"""

import base64
import hashlib
import json
import secrets
from urllib.parse import parse_qs, urlparse

import gigsnano_api.mcp_server.tools  # noqa: F401 — register tools
from gigsnano_api.auth.deps import ACCESS_COOKIE
from gigsnano_api.core.security import create_token


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def test_oauth_code_flow_yields_working_mcp_token(mcp_test_client, persisted_user):
    client = mcp_test_client
    redirect_uri = "http://localhost:9999/callback"

    # 1. Dynamic client registration
    reg = client.post(
        "/oauth/register",
        json={"client_name": "Test MCP Client", "redirect_uris": [redirect_uri]},
    )
    assert reg.status_code == 201, reg.text
    client_id = reg.json()["client_id"]

    # 2. Authorize with consent. The consent step requires a logged-in user:
    #    set the session cookie a browser would carry into /oauth/authorize.
    client.cookies.set(ACCESS_COOKIE, create_token(persisted_user.id, "access"))
    verifier, challenge = _pkce()
    authz = client.post(
        "/oauth/authorize",
        data={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "xyz",
            "scope": "mcp",
            "approve": "1",
        },
        follow_redirects=False,
    )
    assert authz.status_code == 302, authz.text
    location = authz.headers["location"]
    assert location.startswith(redirect_uri)
    qs = parse_qs(urlparse(location).query)
    assert qs["state"] == ["xyz"]
    code = qs["code"][0]

    # 3. Exchange code for a JWT access token (PKCE verifier proves possession)
    tok = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    assert tok.status_code == 200, tok.text
    access_token = tok.json()["access_token"]
    assert tok.json()["token_type"] == "Bearer"

    # 4. Use the OAuth-issued JWT at /mcp — the real client path, no PAT.
    hdr = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    client.post(
        "/mcp/",
        headers=hdr,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "oauth-e2e", "version": "1"},
            },
        },
    )
    listed = client.post(
        "/mcp/",
        headers=hdr,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert listed.status_code == 200, listed.text
    tools = json.loads(listed.text)["result"]["tools"]
    names = {t["name"] for t in tools}
    assert len(names) >= 30 and "get_work_item" in names

    # PKCE replay guard: the code is single-use
    replay = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    assert replay.status_code == 400
