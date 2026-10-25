"""GIN-369: bounded aggregated get_work_item_context tool."""

import pytest

from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.mcp_server.tools import ApiError, get_work_item_context


@pytest.mark.asyncio
async def test_context_default_sections(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    ctx = await get_work_item_context(seed_story.code)

    assert ctx["work_item"]["code"] == seed_story.code
    assert ctx["snapshot_consistent"] is False  # independent reads, honestly flagged
    assert ctx["as_of"] and ctx["version"]
    assert ctx["workspace"] == "acme"
    assert ctx["project"]["identifier"] == "MBA"

    # default sections present, each a bounded collection with truncation metadata
    for section in ("children", "relations", "links", "comments"):
        assert section in ctx
    assert {"total", "returned", "truncated", "items"} <= set(ctx["children"])

    # expensive sections are opt-in, never returned by default
    for section in ("documents", "runs", "options", "routing"):
        assert section not in ctx


@pytest.mark.asyncio
async def test_context_explicit_include_replaces_defaults(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    ctx = await get_work_item_context(seed_story.code, include=["options"])

    assert "options" in ctx
    assert "statuses" in ctx["options"] and "assignable_members" in ctx["options"]
    # an explicit include list replaces the defaults — children was not requested
    assert "children" not in ctx


@pytest.mark.asyncio
async def test_context_rejects_unknown_include(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError):
        await get_work_item_context(seed_story.code, include=["bogus"])
