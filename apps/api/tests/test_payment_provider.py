from gigsnano_api.models import EConnectStatus
from gigsnano_api.payments.provider import (
    FakePaymentProvider,
    TopupResult,
    build_default_payment_provider,
)


async def test_fake_topup_returns_ref():
    res = await FakePaymentProvider().create_topup(5000, "ws1", "acme")
    assert res.provider_ref.startswith("fake_pi_")


async def test_fake_topup_returns_checkout_url_and_immediate():
    res = await FakePaymentProvider().create_topup(5000, "ws1", "acme")
    assert isinstance(res, TopupResult)
    assert res.immediate is True
    assert res.checkout_url
    assert res.provider_ref.startswith("fake_pi_")


async def test_fake_topup_refs_are_unique():
    p = FakePaymentProvider()
    a = await p.create_topup(100, "ws1", "acme")
    b = await p.create_topup(100, "ws1", "acme")
    assert a.provider_ref != b.provider_ref


async def test_fake_connect_auto_active():
    p = FakePaymentProvider()
    acct = await p.create_connect_account("user1")
    status, payouts = await p.account_status(acct)
    assert status == EConnectStatus.ACTIVE
    assert payouts is True


def test_default_provider_is_fake_without_keys(monkeypatch):
    # Force "no keys" regardless of any local .env on the settings singleton.
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "stripe_secret_key", "")
    assert isinstance(build_default_payment_provider(), FakePaymentProvider)
