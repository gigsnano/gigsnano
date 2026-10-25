from gigsnano_api.core.config import settings


def test_stripe_api_version_pinned():
    assert settings.stripe_api_version  # non-empty pinned version
