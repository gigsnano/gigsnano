from gigsnano_api.core.config import settings


def test_billing_settings_have_defaults():
    assert settings.platform_fee_bps == 2000  # 20% default
    assert hasattr(settings, "stripe_secret_key")
    assert hasattr(settings, "stripe_publishable_key")
    assert hasattr(settings, "stripe_webhook_secret")
    assert hasattr(settings, "stripe_connect_return_url")
    assert hasattr(settings, "stripe_connect_refresh_url")


def test_stripe_empty_by_default():
    # Hermetic: assert the declared default is empty (a real local .env may set a live
    # key on the `settings` singleton, which must not make this env-dependent).
    from gigsnano_api.core.config import Settings

    assert Settings.model_fields["stripe_secret_key"].default == ""  # empty ⇒ FakePaymentProvider
