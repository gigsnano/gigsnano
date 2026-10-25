from gigsnano_api.core.config import Settings


def test_context_engine_settings_defaults():
    # Assert the declared defaults, not the live singleton — the dev .env
    # overrides these (context engine on, real FalkorDB URL) and would pollute
    # a singleton read. Defaults keep tests/keyless on the fake path.
    fields = Settings.model_fields
    assert fields["context_engine_enabled"].default is False
    assert fields["falkordb_url"].default == "redis://localhost:6379"
    assert fields["scip_timeout_s"].default == 900


def test_context_engine_package_importable():
    import gigsnano_api.context_engine  # noqa: F401
