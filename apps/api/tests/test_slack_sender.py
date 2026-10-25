import httpx

from gigsnano_api.models import EDeliveryStatus
from gigsnano_api.webhooks.slack_sender import HttpxSlackSender


async def test_httpx_slack_sender_ok_true_is_success():
    sender = HttpxSlackSender(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json={"ok": True}))
    )
    r = await sender.send(token="tok", channel_id="C1", text="hi")
    assert r.status == EDeliveryStatus.SUCCESS and r.response_code == 200


async def test_httpx_slack_sender_non_json_200_body_is_failed_not_raised():
    """A 200 with a non-JSON/blank body (e.g. an upstream proxy error page) must
    not raise json.JSONDecodeError out of the background task — GIN-23 fix."""
    sender = HttpxSlackSender(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, text="<html>oops</html>"))
    )
    r = await sender.send(token="tok", channel_id="C1", text="hi")
    assert r.status == EDeliveryStatus.FAILED and r.response_code == 200
