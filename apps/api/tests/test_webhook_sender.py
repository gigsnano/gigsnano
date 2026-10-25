import httpx

from gigsnano_api.models import EDeliveryStatus
from gigsnano_api.webhooks.sender import (
    DeliveryResult,
    FakeWebhookSender,
    HttpxWebhookSender,
    build_default_webhook_sender,
    sign_payload,
)


def test_sign_payload_is_deterministic_and_prefixed():
    a = sign_payload("whsec_x", b"{}")
    b = sign_payload("whsec_x", b"{}")
    assert a == b
    assert a.startswith("sha256=")
    assert len(a) == len("sha256=") + 64  # hex sha256


async def test_fake_sender_returns_success():
    r = await FakeWebhookSender().send(
        url="https://h/x", event="story.created", payload={}, secret="s"
    )
    assert r == DeliveryResult(EDeliveryStatus.SUCCESS, 200)


async def test_httpx_sender_signs_and_maps_2xx():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["event"] = request.headers.get("X-GigsNano-Event")
        seen["sig"] = request.headers.get("X-GigsNano-Signature")
        seen["body"] = request.content
        return httpx.Response(200)

    sender = HttpxWebhookSender(transport=httpx.MockTransport(handler))
    r = await sender.send(
        url="https://h/x", event="story.created", payload={"a": 1}, secret="whsec_k"
    )
    assert r.status == EDeliveryStatus.SUCCESS and r.response_code == 200
    assert seen["event"] == "story.created"
    assert seen["sig"] == sign_payload("whsec_k", seen["body"])


async def test_httpx_sender_non_2xx_is_failed():
    sender = HttpxWebhookSender(transport=httpx.MockTransport(lambda req: httpx.Response(500)))
    r = await sender.send(url="https://h/x", event="e", payload={}, secret="s")
    assert r.status == EDeliveryStatus.FAILED and r.response_code == 500


async def test_httpx_sender_network_error_is_failed_zero():
    def boom(req):
        raise httpx.ConnectError("nope")

    sender = HttpxWebhookSender(transport=httpx.MockTransport(boom))
    r = await sender.send(url="https://h/x", event="e", payload={}, secret="s")
    assert r.status == EDeliveryStatus.FAILED and r.response_code == 0


def test_build_default_selects_fake_then_httpx(monkeypatch):
    from gigsnano_api.core import config

    monkeypatch.setattr(config.settings, "webhooks_real_delivery", False)
    assert isinstance(build_default_webhook_sender(), FakeWebhookSender)
    monkeypatch.setattr(config.settings, "webhooks_real_delivery", True)
    assert isinstance(build_default_webhook_sender(), HttpxWebhookSender)
