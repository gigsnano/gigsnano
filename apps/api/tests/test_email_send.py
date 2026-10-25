import logging

from gigsnano_api.email.send import send_email_in_background


class _BoomProvider:
    async def send(self, to, subject, html):
        raise RuntimeError("acs domain not verified")


async def test_send_failure_is_logged_at_error(caplog):
    with caplog.at_level(logging.ERROR, logger="gigsnano.email"):
        await send_email_in_background(_BoomProvider(), "a@b.test", "Hi", "<p>Hi</p>")
    assert any(
        "email send failed" in r.message
        or "acs domain not verified" in str(r.exc_info or "")
        for r in caplog.records
    )


async def test_send_does_not_raise():
    # Must never propagate — the request path depends on this.
    await send_email_in_background(_BoomProvider(), "a@b.test", "Hi", "<p>Hi</p>")
