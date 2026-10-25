"""The ChatGPT connector contract: tools literally named `search` and `fetch`.

ChatGPT binds MCP connectors through this fixed pair, so the names and the exact
response keys ARE the contract — a rename or a stray wrapper key breaks the
connector silently. These tests pin both.
"""

import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer


@pytest.mark.asyncio
async def test_search_returns_the_connector_result_shape(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)

    payload = await tools.search(query="Test story")

    assert set(payload) == {"results"}, "ChatGPT reads `results` and nothing else"
    hit = next(r for r in payload["results"] if r["id"] == seed_story.code)
    assert set(hit) == {"id", "title", "url"}
    assert seed_story.code in hit["title"] and "Test story" in hit["title"]
    assert hit["url"].endswith(f"/issues/{seed_story.id}")


@pytest.mark.asyncio
async def test_fetch_reads_back_an_id_that_search_returned(pat_for_user, seed_story):
    """The round-trip is the contract: `fetch` must accept `search`'s `id` verbatim."""
    set_bearer(pat_for_user.token)

    found = await tools.search(query="Test story")
    ident = next(r["id"] for r in found["results"] if r["id"] == seed_story.code)

    item = await tools.fetch(id=ident)

    assert set(item) == {"id", "title", "text", "url", "metadata"}
    assert item["id"] == seed_story.code
    assert item["title"] == "Test story"
    assert isinstance(item["text"], str)
    assert item["metadata"]["status"] == seed_story.status


@pytest.mark.asyncio
async def test_fetch_never_returns_raw_html_in_text(client, pat_for_user, seed_project):
    """ChatGPT renders `text` as prose, so stored HTML is stripped, not shipped."""
    set_bearer(pat_for_user.token)
    created = (
        await client.post(
            f"/api/workspaces/{pat_for_user.workspace_slug}/projects/{seed_project.id}/stories/",
            json={"title": "Tagged", "description": "<p>hello <b>world</b></p>"},
        )
    ).json()

    item = await tools.fetch(id=created["code"])

    assert "<" not in item["text"]
    assert "hello" in item["text"] and "world" in item["text"]


@pytest.mark.asyncio
async def test_fetch_rejects_an_unknown_id(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError):
        await tools.fetch(id="NOPE-9999")


def test_both_tools_are_registered_under_their_contract_names():
    # A rename would leave every other test passing while the connector silently
    # binds nothing, so the names themselves are asserted.
    assert "search" in tools.__all__ and "fetch" in tools.__all__
