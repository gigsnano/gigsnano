"""Push delivery seam: a fake by default, Expo's HTTP API when `push_real_delivery`.

Mirrors `webhooks/slack_sender.py`. Tickets map back to messages by position, one
per message. `send` never raises: a failed chunk becomes failed tickets, so the
worker can settle every claimed row and a bad payload never blocks the queue.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
CHUNK_SIZE = 100


@dataclass(frozen=True)
class PushMessage:
    to: str
    title: str
    body: str
    data: dict


@dataclass(frozen=True)
class PushTicket:
    ok: bool
    error: str | None = None
    # Network, 429 or 5xx: Expo might accept it later. Never retried — rows are
    # claimed before sending, so a retry could deliver twice.
    transient: bool = False


class PushSender(Protocol):
    async def send(self, messages: list[PushMessage]) -> list[PushTicket]: ...


@dataclass
class FakePushSender:
    """Keyless default: records every message, every ticket ok."""

    sent: list[PushMessage] = field(default_factory=list)

    async def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        self.sent.extend(messages)
        return [PushTicket(True, None) for _ in messages]


def _payload(message: PushMessage) -> dict[str, Any]:
    return {
        "to": message.to,
        "title": message.title,
        "body": message.body,
        "data": message.data,
        "sound": "default",
        "channelId": "default",
    }


def _ticket(raw: dict) -> PushTicket:
    if raw.get("status") == "error":
        details = raw.get("details") or {}
        return PushTicket(False, details.get("error") or raw.get("message") or "error")
    return PushTicket(True, None)


class HttpxExpoPushSender:
    """Real Expo call. `transport` is injectable for tests (httpx.MockTransport)."""

    def __init__(
        self, *, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 10.0
    ):
        self._transport = transport
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        from gigsnano_api.core.config import settings

        headers = {
            "accept": "application/json",
            "accept-encoding": "gzip, deflate",
            "content-type": "application/json",
        }
        if settings.expo_access_token:
            headers["Authorization"] = f"Bearer {settings.expo_access_token}"
        return headers

    async def _post_chunk(
        self, http: httpx.AsyncClient, chunk: list[PushMessage]
    ) -> list[PushTicket]:
        try:
            res = await http.post(
                EXPO_PUSH_URL, json=[_payload(m) for m in chunk], headers=self._headers()
            )
        except httpx.HTTPError:
            return [PushTicket(False, "network", transient=True)] * len(chunk)
        if not 200 <= res.status_code < 300:
            transient = res.status_code == 429 or res.status_code >= 500
            return [PushTicket(False, f"http_{res.status_code}", transient)] * len(chunk)
        try:
            tickets = (res.json() or {}).get("data") or []
        except ValueError:
            tickets = []
        if len(tickets) != len(chunk):
            return [PushTicket(False, "bad_response", transient=True)] * len(chunk)
        return [_ticket(t) for t in tickets]

    async def send(self, messages: list[PushMessage]) -> list[PushTicket]:
        """Post in chunks. A 4xx fails only its chunk; a transient failure stops the
        run (Expo is down or rate-limiting) and the rest are `not_attempted`."""
        out: list[PushTicket] = []
        async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as http:
            for i in range(0, len(messages), CHUNK_SIZE):
                tickets = await self._post_chunk(http, messages[i : i + CHUNK_SIZE])
                out.extend(tickets)
                if tickets and tickets[0].transient:
                    break
        rest = len(messages) - len(out)
        return out + [PushTicket(False, "not_attempted", transient=True)] * rest


def build_default_push_sender() -> PushSender:
    from gigsnano_api.core.config import settings

    return HttpxExpoPushSender() if settings.push_real_delivery else FakePushSender()
