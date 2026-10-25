from gigsnano_api.core.config import settings


def test_workspace_settings_have_defaults():
    assert settings.workspace_base_path  # non-empty default
    assert hasattr(settings, "github_app_slug")
    assert hasattr(settings, "github_setup_redirect_uri")
