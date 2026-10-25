"""Startup guards for unsafe production configuration."""
import pytest
from pydantic import ValidationError

from gigsnano_api.core.config import Settings, deployment_warnings

DEFAULT_SECRET = "dev-secret-change-me"


def test_default_jwt_secret_rejected_when_cookies_are_secure():
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(_env_file=None, cookie_secure=True, jwt_secret=DEFAULT_SECRET)


def test_custom_jwt_secret_accepted_when_cookies_are_secure():
    s = Settings(_env_file=None, cookie_secure=True, jwt_secret="x" * 40)
    assert s.cookie_secure is True


def test_default_jwt_secret_allowed_for_local_http():
    assert Settings(_env_file=None, cookie_secure=False).jwt_secret == DEFAULT_SECRET


def test_warns_when_live_stripe_key_but_billing_disabled():
    s = Settings(_env_file=None, stripe_secret_key="sk_live_abc", billing_enabled=False)
    assert any("BILLING_ENABLED" in w for w in deployment_warnings(s))


def test_no_warning_for_keyless_self_host():
    assert deployment_warnings(Settings(_env_file=None)) == []


def test_no_warning_when_hosted_billing_is_on():
    s = Settings(_env_file=None, stripe_secret_key="sk_live_abc", billing_enabled=True)
    assert deployment_warnings(s) == []
