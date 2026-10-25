"""Email provider seam. FakeEmailProvider (keyless dev) ↔ AcsEmailProvider (Azure
Communication Services). Mirrors the Stripe/GitHub seams."""

from typing import ClassVar, Protocol
from uuid import uuid4

from gigsnano_api.core.config import settings


class EmailProvider(Protocol):
    async def send(
        self, to: str, subject: str, html: str, text: str | None = None
    ) -> str: ...


class FakeEmailProvider:
    """Keyless dev: records sends in-memory, logs to stdout."""

    sent: ClassVar[list[dict]] = []

    @classmethod
    def reset(cls) -> None:
        cls.sent = []

    async def send(self, to, subject, html, text=None):
        ref = f"fake_email_{uuid4().hex[:16]}"
        FakeEmailProvider.sent.append(
            {"to": to, "subject": subject, "html": html, "ref": ref}
        )
        print(f"[FakeEmail] to={to} subject={subject!r} ref={ref}")
        return ref


class AcsEmailProvider:
    """Azure Communication Services Email via azure-communication-email."""

    def __init__(self) -> None:
        from azure.communication.email import EmailClient

        self._client = EmailClient.from_connection_string(settings.acs_connection_string)

    async def send(self, to, subject, html, text=None):
        import asyncio
        import functools
        message = {
            "senderAddress": settings.email_from,
            "recipients": {"to": [{"address": to}]},
            "content": {"subject": subject, "html": html, "plainText": text or ""},
        }
        if settings.email_reply_to:
            message["replyTo"] = [{"address": settings.email_reply_to}]
        loop = asyncio.get_running_loop()
        # ACS SDK is synchronous — run the blocking call off the event loop.
        # Return once ACS accepts the message. ACS throttles with Retry-After
        # values near an hour and the SDK sleeps the full interval on both a
        # retried send and the delivery poll; this runs as a background task
        # that keeps its request's DB connection checked out, so an unbounded
        # wait drains the pool and takes every endpoint down. Hence no polling,
        # no retry, and bounded network timeouts.
        poller = await loop.run_in_executor(
            None,
            functools.partial(
                self._client.begin_send,
                message,
                polling=False,
                retry_total=0,
                connection_timeout=10,
                read_timeout=30,
            ),
        )
        result = poller.result()  # the accepted response; no network call
        if isinstance(result, dict):
            return result.get("id") or result.get("messageId") or str(result)
        return str(result)


def build_default_email_provider() -> EmailProvider:
    if settings.acs_connection_string:
        return AcsEmailProvider()
    return FakeEmailProvider()
