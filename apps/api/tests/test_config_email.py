from gigsnano_api.core.config import settings


def test_email_settings_exist_with_defaults():
    # Hermetic: assert the declared default (a real local .env may set a live ACS string
    # on the `settings` singleton, which must not make this env-dependent).
    from gigsnano_api.core.config import Settings

    assert Settings.model_fields["acs_connection_string"].default == ""
    assert hasattr(settings, "email_from")
    assert hasattr(settings, "email_reply_to")
    assert settings.app_base_url
