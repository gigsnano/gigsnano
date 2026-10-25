"""Slack OAuth App (bot-token web flow) — mirrors `sync/github_oauth.py` exactly:
Real path activates when SLACK_CLIENT_ID/SECRET are set; FakeSlackOAuth serves
keyless dev/tests. Scope is `chat:write,channels:read` (post + list channels for
the picker) — no Incoming-Webhook fallback, one transport only (see plan §b)."""

from dataclasses import dataclass
from typing import NamedTuple, Protocol
from urllib.parse import urlencode

import httpx
from fastapi import Request

from gigsnano_api.core.config import settings

_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
_TOKEN_URL = "https://slack.com/api/oauth.v2.access"  # nosec B105 - endpoint URL
_CHANNELS_URL = "https://slack.com/api/conversations.list"


class SlackOAuthError(Exception):
    """Code exchange failed or Slack returned an error."""


@dataclass(frozen=True)
class SlackTokenResult:
    access_token: str
    team_id: str
    team_name: str
    bot_user_id: str


class SlackChannel(NamedTuple):
    id: str
    name: str


class SlackOAuth(Protocol):
    def authorize_url(self, state: str) -> str: ...

    async def exchange_code(self, code: str) -> SlackTokenResult: ...

    async def list_channels(self, token: str) -> list[SlackChannel]: ...


class FakeSlackOAuth:
    """Keyless dev/tests: canned team + 3 channels, no network."""

    async def exchange_code(self, code: str) -> SlackTokenResult:
        return SlackTokenResult(
            access_token="fake-slack-token",  # nosec B106 - keyless-dev placeholder
            team_id="T-FAKE",
            team_name="Acme (fake)",
            bot_user_id="U-FAKEBOT",
        )

    def authorize_url(self, state: str) -> str:
        return f"{_AUTHORIZE_URL}?state={state}&fake=1"

    async def list_channels(self, token: str) -> list[SlackChannel]:
        return [
            SlackChannel("C-GENERAL", "general"),
            SlackChannel("C-ENG", "engineering"),
            SlackChannel("C-ALERTS", "alerts"),
        ]


class RealSlackOAuth:
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str, scopes: str) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.scopes = scopes

    def authorize_url(self, state: str) -> str:
        query = urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": self.redirect_uri,
                "scope": self.scopes,
                "state": state,
            }
        )
        return f"{_AUTHORIZE_URL}?{query}"

    async def exchange_code(self, code: str) -> SlackTokenResult:
        async with httpx.AsyncClient() as http:
            res = await http.post(
                _TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                },
            )
            res.raise_for_status()
        body = res.json()
        if not body.get("ok"):
            raise SlackOAuthError(body.get("error") or "Slack OAuth exchange failed")
        return SlackTokenResult(
            access_token=body["access_token"],
            team_id=body.get("team", {}).get("id", ""),
            team_name=body.get("team", {}).get("name", ""),
            bot_user_id=body.get("bot_user_id", ""),
        )

    async def list_channels(self, token: str) -> list[SlackChannel]:
        headers = {"Authorization": f"Bearer {token}"}
        channels: list[SlackChannel] = []
        cursor = ""
        async with httpx.AsyncClient(headers=headers) as http:
            for _ in range(10):  # cap at 1000 channels
                params = {"limit": 100, "types": "public_channel,private_channel"}
                if cursor:
                    params["cursor"] = cursor
                res = await http.get(_CHANNELS_URL, params=params)
                res.raise_for_status()
                body = res.json()
                if not body.get("ok"):
                    raise SlackOAuthError(body.get("error") or "Could not list channels")
                channels.extend(
                    SlackChannel(c["id"], c["name"]) for c in body.get("channels", [])
                )
                cursor = body.get("response_metadata", {}).get("next_cursor", "")
                if not cursor:
                    break
        return channels


def build_slack_oauth() -> SlackOAuth:
    if settings.slack_client_id and settings.slack_client_secret:
        return RealSlackOAuth(
            client_id=settings.slack_client_id,
            client_secret=settings.slack_client_secret,
            redirect_uri=settings.slack_redirect_uri,
            scopes="chat:write,channels:read",
        )
    return FakeSlackOAuth()


def get_slack_oauth(request: Request) -> SlackOAuth:
    return request.app.state.slack_oauth
