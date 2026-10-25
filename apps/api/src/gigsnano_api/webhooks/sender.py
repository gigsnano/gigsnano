from __future__ import annotations

import hashlib
import hmac
import json
from typing import NamedTuple, Protocol

import httpx
from fastapi import Request

from gigsnano_api.models import EDeliveryStatus


class DeliveryResult(NamedTuple):
    status: EDeliveryStatus
    response_code: int


def sign_payload(secret: str, raw_body: bytes) -> str:
    """HMAC-SHA256 of the exact request body, hex, prefixed 'sha256='."""
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class WebhookSender(Protocol):
    async def send(
        self, *, url: str, event: str, payload: dict, secret: str
    ) -> DeliveryResult: ...


class FakeWebhookSender:
    """Keyless default: records a deterministic success, no network."""

    async def send(self, *, url: str, event: str, payload: dict, secret: str) -> DeliveryResult:
        return DeliveryResult(EDeliveryStatus.SUCCESS, 200)


class HttpxWebhookSender:
    """Real outbound POST. `transport` is injectable for tests (httpx.MockTransport)."""

    def __init__(
        self, *, timeout: float = 5.0, transport: httpx.AsyncBaseTransport | None = None
    ):
        self._timeout = timeout
        self._transport = transport

    async def send(self, *, url: str, event: str, payload: dict, secret: str) -> DeliveryResult:
        raw = json.dumps(payload).encode()
        headers = {
            "Content-Type": "application/json",
            "X-GigsNano-Event": event,
            "X-GigsNano-Signature": sign_payload(secret, raw),
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as http:
                res = await http.post(url, content=raw, headers=headers)
        except httpx.RequestError:
            return DeliveryResult(EDeliveryStatus.FAILED, 0)
        ok = 200 <= res.status_code < 300
        return DeliveryResult(
            EDeliveryStatus.SUCCESS if ok else EDeliveryStatus.FAILED, res.status_code
        )


def build_default_webhook_sender() -> WebhookSender:
    from gigsnano_api.core.config import settings

    return HttpxWebhookSender() if settings.webhooks_real_delivery else FakeWebhookSender()


def get_webhook_sender(request: Request) -> WebhookSender:
    return request.app.state.webhook_sender
