"""Slack message delivery — deliberately placed alongside `webhooks/` since it
reuses that module's dispatch plumbing (WEBHOOK_EVENTS catalog, fresh-session
background delivery), not a parallel `notifications/` template flag.

`FakeSlackSender` is the keyless default (mirrors `FakeWebhookSender`);
`HttpxSlackSender` calls `chat.postMessage` for real, gated by
`slack_real_delivery` exactly like `webhooks_real_delivery`."""

from __future__ import annotations

import json
from typing import NamedTuple, Protocol

import httpx
from fastapi import Request

from gigsnano_api.models import EDeliveryStatus


class SlackDeliveryResult(NamedTuple):
    status: EDeliveryStatus
    response_code: int


class SlackSender(Protocol):
    async def send(self, *, token: str, channel_id: str, text: str) -> SlackDeliveryResult: ...


class FakeSlackSender:
    """Keyless default: records a deterministic success, no network."""

    async def send(self, *, token: str, channel_id: str, text: str) -> SlackDeliveryResult:
        return SlackDeliveryResult(EDeliveryStatus.SUCCESS, 200)


class HttpxSlackSender:
    """Real `chat.postMessage` call. `transport` is injectable for tests."""

    def __init__(
        self, *, timeout: float = 5.0, transport: httpx.AsyncBaseTransport | None = None
    ):
        self._timeout = timeout
        self._transport = transport

    async def send(self, *, token: str, channel_id: str, text: str) -> SlackDeliveryResult:
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as http:
                res = await http.post(
                    "https://slack.com/api/chat.postMessage",
                    headers=headers,
                    json={"channel": channel_id, "text": text},
                )
        except httpx.RequestError:
            return SlackDeliveryResult(EDeliveryStatus.FAILED, 0)
        try:
            ok = res.status_code == 200 and res.json().get("ok") is True
        except json.JSONDecodeError:
            ok = False
        return SlackDeliveryResult(
            EDeliveryStatus.SUCCESS if ok else EDeliveryStatus.FAILED, res.status_code
        )


def build_default_slack_sender() -> SlackSender:
    from gigsnano_api.core.config import settings

    return HttpxSlackSender() if settings.slack_real_delivery else FakeSlackSender()


def get_slack_sender(request: Request) -> SlackSender:
    return request.app.state.slack_sender
