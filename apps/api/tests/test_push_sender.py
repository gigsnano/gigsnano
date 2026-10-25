import json

import httpx
import pytest

from gigsnano_api.core.config import settings
from gigsnano_api.features.push.sender import (
    FakePushSender,
    HttpxExpoPushSender,
    PushMessage,
    PushTicket,
    build_default_push_sender,
)


def _msgs(n: int) -> list[PushMessage]:
    return [PushMessage(f"ExponentPushToken[{i}]", "t", "b", {"route": "/inbox"}) for i in range(n)]


def _sender(handler) -> HttpxExpoPushSender:
    return HttpxExpoPushSender(transport=httpx.MockTransport(handler))


async def test_chunks_of_100():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = json.loads(request.content)
        return httpx.Response(200, json={"data": [{"status": "ok"} for _ in body]})

    tickets = await _sender(handler).send(_msgs(150))
    assert [len(json.loads(r.content)) for r in requests] == [100, 50]
    assert len(tickets) == 150 and all(t.ok for t in tickets)
    first = json.loads(requests[0].content)[0]
    assert first["sound"] == "default" and first["channelId"] == "default"


async def test_bearer_only_when_token_set(monkeypatch):
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(200, json={"data": [{"status": "ok"}]})

    monkeypatch.setattr(settings, "expo_access_token", "")
    await _sender(handler).send(_msgs(1))
    monkeypatch.setattr(settings, "expo_access_token", "tok")
    await _sender(handler).send(_msgs(1))
    assert seen == [None, "Bearer tok"]


async def test_error_ticket_maps_device_not_registered():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"data": [{"status": "error", "message": "x",
                            "details": {"error": "DeviceNotRegistered"}}]},
        )

    assert await _sender(handler).send(_msgs(1)) == [PushTicket(False, "DeviceNotRegistered")]


@pytest.mark.parametrize("status", [429, 500, 503])
async def test_rate_limit_and_5xx_are_transient_and_never_raise(status):
    tickets = await _sender(lambda r: httpx.Response(status)).send(_msgs(2))
    assert tickets == [PushTicket(False, f"http_{status}", transient=True)] * 2


async def test_network_error_is_transient():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    assert await _sender(handler).send(_msgs(1)) == [PushTicket(False, "network", transient=True)]


async def test_4xx_fails_that_chunk_and_the_queue_moves_on():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(400)
        return httpx.Response(200, json={"data": [{"status": "ok"} for _ in json.loads(request.content)]})

    tickets = await _sender(handler).send(_msgs(150))
    assert calls["n"] == 2
    assert tickets[:100] == [PushTicket(False, "http_400")] * 100
    assert all(t.ok for t in tickets[100:]) and len(tickets) == 150


async def test_later_chunk_failure_keeps_earlier_tickets_and_stops():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 2:
            return httpx.Response(500)
        return httpx.Response(200, json={"data": [{"status": "ok"} for _ in json.loads(request.content)]})

    tickets = await _sender(handler).send(_msgs(250))
    assert calls["n"] == 2  # a transient failure stops the run; chunk 3 is not attempted
    assert len(tickets) == 250 and all(t.ok for t in tickets[:100])
    assert {t.error for t in tickets[100:]} == {"http_500", "not_attempted"}
    assert all(t.transient for t in tickets[100:])


async def test_ticket_count_mismatch_is_transient():
    tickets = await _sender(lambda r: httpx.Response(200, json={"data": []})).send(_msgs(2))
    assert tickets == [PushTicket(False, "bad_response", transient=True)] * 2


async def test_default_sender_is_fake_unless_real_delivery(monkeypatch):
    monkeypatch.setattr(settings, "push_real_delivery", False)
    assert isinstance(build_default_push_sender(), FakePushSender)
    monkeypatch.setattr(settings, "push_real_delivery", True)
    assert isinstance(build_default_push_sender(), HttpxExpoPushSender)
