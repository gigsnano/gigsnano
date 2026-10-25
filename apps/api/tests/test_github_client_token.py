import pytest

from gigsnano_api.sync.github_client import FakeGitHubClient


@pytest.mark.anyio
async def test_fake_installation_token():
    tok = await FakeGitHubClient().installation_token(1)
    assert tok == "fake-installation-token"
