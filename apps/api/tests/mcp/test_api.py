import pytest

from gigsnano_api.mcp_server import api as mcp_api
from gigsnano_api.mcp_server.auth import set_bearer


@pytest.mark.asyncio
async def test_api_forwards_bearer_and_calls_route(pat_for_user):
    set_bearer(pat_for_user.token)
    projects = await mcp_api.api("GET", f"/workspaces/{pat_for_user.workspace_slug}/projects/")
    assert isinstance(projects, list)
