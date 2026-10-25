from gigsnano_api.email.provider import (
    AcsEmailProvider,
    FakeEmailProvider,
    build_default_email_provider,
)


async def test_fake_records_send():
    p = FakeEmailProvider()
    p.reset()
    ref = await p.send("a@b.com", "Hi", "<p>Hi</p>")
    assert ref.startswith("fake_email_")
    assert FakeEmailProvider.sent[-1]["to"] == "a@b.com"
    assert FakeEmailProvider.sent[-1]["subject"] == "Hi"


def test_default_is_fake_without_acs(monkeypatch):
    # Force "no ACS" regardless of any local .env on the settings singleton.
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "acs_connection_string", "")
    assert isinstance(build_default_email_provider(), FakeEmailProvider)


def _stub_provider(calls, result):
    class _Poller:
        def result(self):
            return result

    class _Client:
        def begin_send(self, message, **kwargs):
            calls["message"] = message
            calls["kwargs"] = kwargs
            return _Poller()

    p = AcsEmailProvider.__new__(AcsEmailProvider)   # bypass __init__ (no real ACS)
    p._client = _Client()                            # inject stub
    return p


async def test_acs_send_reads_operation_id():
    calls = {}
    p = _stub_provider(calls, {"id": "acs-123", "status": "Running"})
    ref = await p.send("a@b.com", "Hi", "<p>Hi</p>")
    assert ref == "acs-123"
    assert calls["message"]["recipients"]["to"][0]["address"] == "a@b.com"


async def test_acs_send_never_waits_on_throttling():
    # ACS throttles with Retry-After values near an hour, and the SDK sleeps the
    # whole interval on both the send and the delivery poll. The send runs as a
    # background task that pins its request's DB connection, so an unbounded wait
    # exhausts the pool. Stop at "accepted": no poll, no retry, bounded I/O.
    calls = {}
    p = _stub_provider(calls, {"id": "acs-123", "status": "Running"})
    await p.send("a@b.com", "Hi", "<p>Hi</p>")
    assert calls["kwargs"]["polling"] is False
    assert calls["kwargs"]["retry_total"] == 0
    assert calls["kwargs"]["connection_timeout"] <= 10
    assert calls["kwargs"]["read_timeout"] <= 30
