from gigsnano_api.email.messages import (
    email_shell,
    invite_email,
    password_reset_email,
    verify_email,
)
from gigsnano_api.email.send import send_email_in_background


def test_reset_email_contains_link():
    subject, html = password_reset_email("Sam", "https://x/reset?token=abc")
    assert "reset" in subject.lower()
    assert "https://x/reset?token=abc" in html


def test_verify_email_contains_link():
    subject, html = verify_email("Sam", "https://x/verify?token=abc")
    assert "verify" in subject.lower()
    assert "https://x/verify?token=abc" in html


def test_invite_email_contains_workspace():
    subject, html = invite_email("Acme", "https://x/invite/t")
    assert "Acme" in subject
    assert "https://x/invite/t" in html


def test_shell_includes_unsubscribe_when_given():
    html = email_shell("Hi", "<p>body</p>", unsubscribe_url="https://x/unsub/t")
    assert "https://x/unsub/t" in html


async def test_background_send_never_raises_on_provider_error():
    class Boom:
        async def send(self, *a, **k):
            raise RuntimeError("smtp down")

    await send_email_in_background(Boom(), "a@b.com", "s", "<p>h</p>")
