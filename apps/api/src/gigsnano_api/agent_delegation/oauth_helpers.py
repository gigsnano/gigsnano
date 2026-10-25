"""OAuth URL builders for Cursor / Codex / Claude Code connect flows."""

from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

from gigsnano_api.core.config import settings
from gigsnano_api.models import EAgentProvider

# OpenCode / Codex CLI public OAuth client (ChatGPT subscription auth).
CODEX_PUBLIC_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"


def generate_pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def provider_has_oauth_creds(provider: EAgentProvider) -> bool:
    if provider == EAgentProvider.CURSOR:
        # Cursor Cloud Agents use per-user API keys (Dashboard → API Keys), not OAuth.
        return False
    if provider == EAgentProvider.CODEX:
        return bool(settings.codex_oauth_clientid or settings.codex_use_public_client)
    if provider == EAgentProvider.CLAUDE_CODE:
        return bool(
            settings.claude_code_oauth_clientid and settings.claude_code_oauth_clientsecret
        )
    return False


def build_install_url(
    provider: EAgentProvider,
    state: str,
    *,
    pkce_challenge: str | None = None,
) -> str:
    redirect = settings.agent_oauth_redirect_uri

    if not provider_has_oauth_creds(provider):
        return f"{settings.app_base_url.rstrip('/')}/account/settings/agents/callback?code=dev&state={state}"

    if provider == EAgentProvider.CODEX:
        client_id = settings.codex_oauth_clientid or CODEX_PUBLIC_CLIENT_ID
        query: dict[str, str] = {
            "client_id": client_id,
            "redirect_uri": redirect,
            "state": state,
            "response_type": "code",
            "scope": settings.codex_oauth_scopes,
            "id_token_add_organizations": "true",  # nosec B105 - OAuth param value, not a secret
            "codex_cli_simplified_flow": "true",
            "originator": "gigsnano",
        }
        if pkce_challenge:
            query["code_challenge"] = pkce_challenge
            query["code_challenge_method"] = "S256"
        return f"{settings.codex_oauth_authorize_url}?{urlencode(query)}"

    if provider == EAgentProvider.CLAUDE_CODE:
        params = urlencode(
            {
                "client_id": settings.claude_code_oauth_clientid,
                "redirect_uri": redirect,
                "state": state,
                "response_type": "code",
                "scope": settings.claude_code_oauth_scopes,
            }
        )
        return f"{settings.claude_code_oauth_authorize_url}?{params}"

    raise ValueError(f"Unknown provider: {provider}")
