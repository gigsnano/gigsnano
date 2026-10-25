"""Hermetic settings for tests — do not read the developer's .env."""

from gigsnano_api.core.config import Settings


def fresh_settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)
