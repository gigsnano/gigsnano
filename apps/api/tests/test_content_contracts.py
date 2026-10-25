"""GIN-304 — explicit content-format contracts on the API and MCP surfaces.

The point of these is that a caller can *state* the format and a reader can *see*
what it got. Two symptoms this removes:

  * the same tool name behaving differently on the two MCP servers (the Python one
    converted, the TypeScript one didn't), and
  * a response whose `description` might be HTML or Markdown with nothing saying
    which.
"""

from __future__ import annotations

import pytest

from gigsnano_api.core.config import settings

CREATE_PROJECT = {
    "name": "Contracts", "identifier": "CTR", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


@pytest.fixture
def json_flags(monkeypatch):
    monkeypatch.setattr(settings, "content_json_write", True)
    monkeypatch.setattr(settings, "content_json_read", True)


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def create(client, pid, **kw):
    return await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/", json={"title": "T", **kw}
    )


# --- responses say what they are ---------------------------------------------


async def test_every_response_labels_its_content_format(client):
    project = await setup_project(client)
    body = (await create(client, project["id"], description="<p>hi</p>")).json()
    assert body["content_format"] == "html"


async def test_markdown_is_served_when_a_canonical_copy_exists(client, json_flags):
    project = await setup_project(client)
    story = (
        await create(client, project["id"], description="## hi", content_format="markdown")
    ).json()
    res = await client.get(
        f"/api/workspaces/acme/stories/resolve/{story['code']}?content_format=markdown"
    )
    assert res.json()["content_format"] == "markdown"
    assert res.json()["description"].strip() == "## hi"


async def test_asking_for_markdown_without_a_canonical_copy_reports_html(client, json_flags):
    """Asking is a preference, not a guarantee — and the answer is honest about it.

    Editor-authored rows have no canonical copy until GIN-308 backfills, and there
    is deliberately no HTML -> Markdown converter, so the response says `html`
    rather than pretending or silently returning markup labelled as Markdown.
    """
    project = await setup_project(client)
    story = (await create(client, project["id"], description="<p>legacy</p>")).json()
    res = await client.get(
        f"/api/workspaces/acme/stories/resolve/{story['code']}?content_format=markdown"
    )
    assert res.json()["content_format"] == "html"
    assert res.json()["description"] == "<p>legacy</p>"


async def test_an_unknown_outbound_format_is_rejected(client):
    project = await setup_project(client)
    story = (await create(client, project["id"])).json()
    res = await client.get(
        f"/api/workspaces/acme/stories/resolve/{story['code']}?content_format=yaml"
    )
    assert res.status_code == 422


# --- round trip through the stated contract ----------------------------------


async def test_markdown_survives_a_full_write_read_cycle(client, json_flags):
    """What an agent actually does: write Markdown, read it back, edit, write again."""
    project = await setup_project(client)
    source = "## Plan\n\n- [x] first\n- [ ] second\n"
    story = (
        await create(client, project["id"], description=source, content_format="markdown")
    ).json()

    read = await client.get(
        f"/api/workspaces/acme/stories/resolve/{story['code']}?content_format=markdown"
    )
    assert read.json()["description"] == source


async def test_markdown_mentioning_html_tags_is_not_misread(client, json_flags):
    """GIN-134's second root cause. There is no detector left to fool."""
    project = await setup_project(client)
    source = "Use `<p>` for a paragraph.\n"
    story = (
        await create(client, project["id"], description=source, content_format="markdown")
    ).json()
    assert "<code>&lt;p&gt;</code>" in story["description"]

    read = await client.get(
        f"/api/workspaces/acme/stories/resolve/{story['code']}?content_format=markdown"
    )
    assert read.json()["description"] == source


async def test_comment_markdown_round_trips(client, json_flags):
    project = await setup_project(client)
    story = (await create(client, project["id"])).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/comments/",
        json={"body": "| a | b |\n| --- | --- |\n| 1 | 2 |\n", "content_format": "markdown"},
    )
    # GFM tables used to arrive as a paragraph of pipe characters.
    assert "<table>" in res.json()["body"]


# --- the MCP surface ---------------------------------------------------------


def test_the_mcp_server_no_longer_carries_a_format_sniffer() -> None:
    """GIN-117 and GIN-134 both patched the same guess. It is gone, not tuned."""
    from gigsnano_api.mcp_server import tools

    assert not hasattr(tools, "_rich_html")
    assert tools.DEFAULT_CONTENT_FORMAT == "markdown"


def test_rich_text_tools_declare_their_format_to_the_agent() -> None:
    """The contract used to live in a Python docstring no model ever read."""
    from gigsnano_api.mcp_server.server import DESCRIPTIONS

    for tool in ("create_work_item", "update_work_item", "add_comment", "update_comment"):
        assert "Markdown" in DESCRIPTIONS[tool], tool
        assert "content_format" in DESCRIPTIONS[tool], tool


def test_rich_text_tools_accept_a_content_format_argument() -> None:
    import inspect

    from gigsnano_api.mcp_server import tools

    for name in (
        "create_work_item", "update_work_item", "add_comment",
        "update_comment", "get_work_item", "fetch_work_items",
    ):
        fn = getattr(tools, name)
        fn = getattr(fn, "fn", fn)  # unwrap the FastMCP tool wrapper
        params = inspect.signature(fn).parameters
        assert "content_format" in params, name
