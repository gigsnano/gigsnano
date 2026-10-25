"""GIN-366: content-format declarations + structured error surfacing.

The response envelope was deliberately kept native (GIN-270): tools return the
object directly, not a {meta, result} wrapper. Response identity (request_id,
schema/api version, workspace) is delivered as telemetry (GIN-367), not by
reshaping every payload.
"""

import pytest

from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.mcp_server.tools import add_comment, get_work_item, list_comments, update_work_item


@pytest.mark.asyncio
async def test_get_work_item_declares_content_format(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    item = await get_work_item(seed_story.code)
    assert item["content_format"] in {"markdown", "html"}  # declared, never sniffed


@pytest.mark.asyncio
async def test_comment_bodies_declare_format(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    await add_comment(seed_story.code, "hello", content_format="markdown")
    comments = await list_comments(seed_story.code)
    assert comments
    assert all(c["content_format"] == "html" for c in comments)  # rendered HTML, declared


@pytest.mark.asyncio
async def test_structured_error_surfaces_code_and_retryable(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    # A stale optimistic-concurrency write returns a structured error the agent can
    # act on — stable error_code + retryable, not an opaque string.
    with pytest.raises(ApiError) as excinfo:
        await update_work_item(
            seed_story.code, title="x", expected_updated_at="2000-01-01T00:00:00+00:00"
        )
    assert excinfo.value.detail["error_code"] == "stale_write"
    assert excinfo.value.detail["retryable"] is True
    assert "stale_write" in str(excinfo.value)
