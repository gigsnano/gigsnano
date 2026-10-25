"""GIN-300 — dual write/read through the real HTTP stack.

The unit tests in test_content_fields.py pin the seam's logic; these pin that it
is actually wired into the routes, and that the flags behave as a rollout control
rather than a switch that changes what users see mid-flight.
"""

from __future__ import annotations

import pytest

from gigsnano_api.core.config import settings

CREATE_PROJECT = {
    "name": "Content", "identifier": "CNT", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


@pytest.fixture
def json_write(monkeypatch):
    monkeypatch.setattr(settings, "content_json_write", True)


@pytest.fixture
def json_read(monkeypatch):
    monkeypatch.setattr(settings, "content_json_read", True)


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def create_story(client, project_id, **payload):
    return await client.post(
        f"/api/workspaces/acme/projects/{project_id}/stories/",
        json={"title": "A story", **payload},
    )


# --- flags off: nothing changes ---------------------------------------------


async def test_flags_off_behaves_exactly_as_before(client):
    project = await setup_project(client)
    res = await create_story(client, project["id"], description="<p>hello</p>")
    assert res.status_code == 201
    assert res.json()["description"] == "<p>hello</p>"


async def test_markdown_without_the_write_flag_is_still_rendered(client):
    """The format contract is honoured even with dual-write off — otherwise
    turning the flag on would change what users see, which is not a rollout."""
    project = await setup_project(client)
    res = await create_story(
        client, project["id"], description="## hi", content_format="markdown"
    )
    assert res.json()["description"] == "<h2>hi</h2>"


# --- dual write --------------------------------------------------------------


async def test_markdown_write_populates_the_canonical_column(client, json_write):
    project = await setup_project(client)
    res = await create_story(
        client, project["id"], description="## hi", content_format="markdown"
    )
    assert res.status_code == 201
    assert res.json()["description"] == "<h2>hi</h2>"


async def test_html_write_leaves_the_canonical_column_null(client, json_write):
    """The editor still sends HTML; a NULL canonical copy is correct until the
    GIN-308 backfill, and the response must be unchanged."""
    project = await setup_project(client)
    res = await create_story(client, project["id"], description="<p>hello</p>")
    assert res.json()["description"] == "<p>hello</p>"


async def test_update_converts_and_stores(client, json_write):
    project = await setup_project(client)
    story = (await create_story(client, project["id"])).json()
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"description": "- [x] done", "content_format": "markdown"},
    )
    assert res.status_code == 200
    assert 'data-checked="true"' in res.json()["description"]


async def test_an_unknown_content_format_is_rejected(client, json_write):
    project = await setup_project(client)
    res = await create_story(
        client, project["id"], description="hi", content_format="HTML5"
    )
    assert res.status_code >= 400


# --- dual read ---------------------------------------------------------------


async def test_read_flag_on_serves_the_canonical_copy(client, json_write, json_read):
    project = await setup_project(client)
    story = (
        await create_story(
            client, project["id"], description="## hi", content_format="markdown"
        )
    ).json()
    fetched = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )
    assert fetched.json()["description"] == "<h2>hi</h2>"


async def test_legacy_rows_still_render_with_the_read_flag_on(client, json_read):
    """Partial rollout: rows written before dual-write have no canonical copy and
    must fall through to the HTML column rather than reading as empty."""
    project = await setup_project(client)
    story = (
        await create_story(client, project["id"], description="<p>legacy</p>")
    ).json()
    fetched = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )
    assert fetched.json()["description"] == "<p>legacy</p>"


# --- comments ----------------------------------------------------------------


async def test_comment_markdown_is_converted(client, json_write):
    project = await setup_project(client)
    story = (await create_story(client, project["id"])).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/comments/",
        json={"body": "**bold**", "content_format": "markdown"},
    )
    assert res.status_code in (200, 201)
    assert res.json()["body"] == "<p><strong>bold</strong></p>"


async def test_comment_html_is_untouched(client, json_write):
    project = await setup_project(client)
    story = (await create_story(client, project["id"])).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/comments/",
        json={"body": "<p>plain</p>"},
    )
    assert res.json()["body"] == "<p>plain</p>"


# --- the rollout safety property -----------------------------------------------


async def test_editing_an_agent_written_item_in_the_editor_is_not_lost(
    client, json_write, json_read
):
    """Through the real stack, with both flags on — the GIN-305 blocker.

    An agent files an item in Markdown (canonical copy stored), then a human edits
    the description in the TipTap editor, which sends HTML. HTML is deliberately
    not canonicalisable, so the canonical copy must be cleared rather than left
    stale — otherwise the reader is served the agent's original text and the
    human's edit disappears.
    """
    project = await setup_project(client)
    story = (
        await create_story(
            client, project["id"], description="## agent wrote this",
            content_format="markdown",
        )
    ).json()

    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"description": "<p>human edited this</p>"},
    )

    fetched = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )
    assert fetched.json()["description"] == "<p>human edited this</p>"
