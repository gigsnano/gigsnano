import json

import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer


from tests.mcp.payload import dumps

@pytest.mark.asyncio
async def test_get_work_item_returns_story(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    output = await tools.get_work_item(code=seed_story.code)
    assert seed_story.code in dumps(output)


@pytest.mark.asyncio
async def test_start_work_item_sets_in_progress(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    output = await tools.start_work_item(code=seed_story.code)
    assert "in_progress" in dumps(output)


@pytest.mark.asyncio
async def test_create_work_item_links_parent_by_code(pat_for_user, seed_project, seed_story):
    """`parent` as a work-item code resolves to parent_id in one call (GIN-348)."""
    set_bearer(pat_for_user.token)
    output = await tools.create_work_item(
        project=seed_project.id, title="Child", parent=seed_story.code
    )
    child = output
    assert child["parent_id"] == seed_story.id


@pytest.mark.asyncio
async def test_update_work_item_reparents_by_code(pat_for_user, seed_project, seed_story):
    set_bearer(pat_for_user.token)
    child = (
        await tools.create_work_item(project=seed_project.id, title="Loose child")
    )
    assert child["parent_id"] is None
    updated = (
        await tools.update_work_item(code=child["code"], parent=seed_story.code)
    )
    assert updated["parent_id"] == seed_story.id


@pytest.mark.asyncio
async def test_unresolvable_parent_code_raises_not_silently_dropped(pat_for_user, seed_story):
    """The bug was silent-drop; an unknown parent code must error (GIN-348)."""
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError):
        await tools.update_work_item(code=seed_story.code, parent="NOPE-9999")
