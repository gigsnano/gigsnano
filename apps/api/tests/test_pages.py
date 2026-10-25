import json

import httpx
import pytest

from gigsnano_api.core.config import settings
from gigsnano_api.models import Page

_DOC = {
    "type": "doc",
    "content": [{
        "type": "heading",
        "attrs": {"level": 2},
        "content": [{"type": "text", "text": "hello"}],
    }],
}
_DOC_JSON = json.dumps(_DOC)
_DOC_HTML = "<h2>hello</h2>"


@pytest.fixture
def json_write(monkeypatch):
    monkeypatch.setattr(settings, "content_json_write", True)


@pytest.fixture
def json_read(monkeypatch):
    monkeypatch.setattr(settings, "content_json_read", True)


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Grace Hopper", "email": "grace@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()


async def test_pages_crud(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    assert (await client.get(base)).json() == []

    html = "<h1>Runbook</h1><p>Deploy steps.</p>"
    res = await client.post(base, json={"title": "  Runbook  ", "content": html})
    assert res.status_code == 201
    page = res.json()
    assert set(page) == {"id", "workspace_slug", "project_id", "title", "content",
                         "content_format", "created_at", "updated_at"}
    assert page["title"] == "Runbook" and page["content"] == html
    assert page["content_format"] == "html"
    assert page["workspace_slug"] == "acme" and page["project_id"] == pid
    pgid = page["id"]

    one = (await client.get(f"{base}{pgid}/")).json()
    assert one["id"] == pgid and one["content"] == html

    patched = (await client.patch(f"{base}{pgid}/",
                                  json={"content": "<p>Updated.</p>"})).json()
    assert patched["content"] == "<p>Updated.</p>" and patched["title"] == "Runbook"

    res = await client.delete(f"{base}{pgid}/")
    assert res.status_code == 204 and res.content == b""
    assert (await client.get(f"{base}{pgid}/")).status_code == 404
    assert (await client.get(base)).json() == []


async def test_stale_patch_rejected_fresh_patch_succeeds(client):
    """GIN-24 presence v1: the `if_updated_at` optimistic-concurrency guard turns a
    silent last-write-wins clobber into an explicit 409."""
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (await client.post(base, json={"title": "Runbook", "content": "<p>v1</p>"})).json()
    pgid, loaded_updated_at = page["id"], page["updated_at"]

    first = await client.patch(
        f"{base}{pgid}/", json={"content": "<p>v2</p>", "if_updated_at": loaded_updated_at}
    )
    assert first.status_code == 200
    fresh_updated_at = first.json()["updated_at"]

    # Same stale snapshot again -> rejected, content untouched.
    stale = await client.patch(
        f"{base}{pgid}/", json={"content": "<p>stale clobber</p>", "if_updated_at": loaded_updated_at}
    )
    assert stale.status_code == 409
    assert (await client.get(f"{base}{pgid}/")).json()["content"] == "<p>v2</p>"

    ok = await client.patch(
        f"{base}{pgid}/", json={"content": "<p>v3</p>", "if_updated_at": fresh_updated_at}
    )
    assert ok.status_code == 200 and ok.json()["content"] == "<p>v3</p>"

    # Old clients that never send the guard keep working unchanged.
    no_guard = await client.patch(f"{base}{pgid}/", json={"content": "<p>v4</p>"})
    assert no_guard.status_code == 200 and no_guard.json()["content"] == "<p>v4</p>"


async def test_conditional_update_is_atomic_at_the_db(client):
    """GIN-24 review fix: the guard is a DB-level conditional UPDATE, not a Python
    check-then-act -- a matching if_updated_at succeeds, a stale one 409s, and
    neither path lets the check and the write drift apart across two requests."""
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (await client.post(base, json={"title": "Runbook", "content": "<p>v1</p>"})).json()
    pgid, loaded_updated_at = page["id"], page["updated_at"]

    ok = await client.patch(
        f"{base}{pgid}/", json={"content": "<p>v2</p>", "if_updated_at": loaded_updated_at}
    )
    assert ok.status_code == 200 and ok.json()["content"] == "<p>v2</p>"

    conflict = await client.patch(
        f"{base}{pgid}/", json={"content": "<p>clobber</p>", "if_updated_at": loaded_updated_at}
    )
    assert conflict.status_code == 409
    assert (await client.get(f"{base}{pgid}/")).json()["content"] == "<p>v2</p>"


async def test_presence_heartbeat_round_trip(app):
    """Two sessions on the same page each see the other in the live viewer list."""
    transport = httpx.ASGITransport(app=app)
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://test") as ada,
        httpx.AsyncClient(transport=transport, base_url="http://test") as alan,
    ):
        await ada.post("/api/auth/sign-up/", json={
            "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
        })
        await ada.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
        pid = (await ada.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })).json()["id"]
        page_id = (
            await ada.post(f"/api/workspaces/acme/projects/{pid}/pages/", json={"title": "Runbook"})
        ).json()["id"]

        alan_id = (await alan.post("/api/auth/sign-up/", json={
            "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
        })).json()["id"]
        await ada.post("/api/workspaces/acme/members/", json={"user_id": alan_id})
        await ada.post(
            f"/api/workspaces/acme/projects/{pid}/members/", json={"user_id": alan_id, "role": "member"}
        )

        base = f"/api/workspaces/acme/projects/{pid}/pages/{page_id}/presence/"

        ada_view = (await ada.post(base, json={"editing": True})).json()
        assert [v["display_name"] for v in ada_view["viewers"]] == ["Ada Lovelace"]
        assert ada_view["viewers"][0]["editing"] is True

        alan_view = (await alan.post(base, json={})).json()
        by_name = {v["display_name"]: v for v in alan_view["viewers"]}
        assert set(by_name) == {"Ada Lovelace", "Alan Turing"}
        assert by_name["Alan Turing"]["editing"] is False
        assert by_name["Ada Lovelace"]["editing"] is True

        # A plain GET (no heartbeat) sees the same live list, unauthenticated-heartbeat-free.
        listed = (await ada.get(base)).json()
        assert {v["display_name"] for v in listed["viewers"]} == {"Ada Lovelace", "Alan Turing"}


async def test_presence_denies_non_project_member(app):
    transport = httpx.ASGITransport(app=app)
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://test") as ada,
        httpx.AsyncClient(transport=transport, base_url="http://test") as eve,
    ):
        await ada.post("/api/auth/sign-up/", json={
            "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
        })
        await ada.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
        pid = (await ada.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })).json()["id"]
        page_id = (
            await ada.post(f"/api/workspaces/acme/projects/{pid}/pages/", json={"title": "Runbook"})
        ).json()["id"]

        eve_id = (await eve.post("/api/auth/sign-up/", json={
            "display_name": "Eve", "email": "eve@example.test", "password": "s3cret!",
        })).json()["id"]
        # Eve joins the workspace but is never added to this project.
        await ada.post("/api/workspaces/acme/members/", json={"user_id": eve_id})

        base = f"/api/workspaces/acme/projects/{pid}/pages/{page_id}/presence/"
        assert (await eve.post(base, json={})).status_code == 404
        assert (await eve.get(base)).status_code == 404
        # And she never registered as a viewer.
        assert [v["display_name"] for v in (await ada.get(base)).json()["viewers"]] == []


async def test_presence_ttl_expiry(client, monkeypatch):
    from datetime import datetime, timedelta, timezone

    from gigsnano_api.features.pages import router as pages_router

    pid = (await setup_project(client))["id"]
    page_id = (
        await client.post(f"/api/workspaces/acme/projects/{pid}/pages/", json={"title": "Runbook"})
    ).json()["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/{page_id}/presence/"

    now = datetime(2026, 7, 10, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(pages_router, "_now", lambda: now)
    assert len((await client.post(base, json={})).json()["viewers"]) == 1

    monkeypatch.setattr(pages_router, "_now", lambda: now + timedelta(seconds=25))
    assert (await client.get(base)).json()["viewers"] == []
    # GIN-24 review fix: pruning the last viewer must drop the outer page_id key
    # too, or `_presence` grows a permanent empty dict per page for process life.
    assert page_id not in pages_router._presence


async def test_page_validation_defaults_and_scope(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    assert (await client.post(base, json={"title": ""})).status_code == 422

    page = (await client.post(base, json={"title": "Empty"})).json()
    assert page["content"] == ""   # content defaults to ""

    # cross-workspace project → 404
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get(f"/api/workspaces/beta/projects/{pid}/pages/")).status_code == 404


# --- canonical TipTap content (GIN-300 / Task 1.3) ---------------------------


async def test_json_patch_with_write_flag_persists_envelope(client, db_session, json_write):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (await client.post(base, json={"title": "Runbook", "content": "<p>v1</p>"})).json()
    pgid = page["id"]

    res = await client.patch(
        f"{base}{pgid}/",
        json={"content": _DOC_JSON, "content_format": "json"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["content"] == _DOC_HTML
    assert body["content_format"] == "html"
    assert "content_json" not in body

    db_session.expire_all()
    row = await db_session.get(Page, pgid)
    assert row.content == _DOC_HTML
    assert row.content_json is not None
    assert row.content_json["schema"] == "gigsnano.doc"
    assert row.content_json["provenance"]["source"] == "editor"
    # validate_doc fills default attrs (e.g. textAlign) — assert semantics, not bytes.
    stored = row.content_json["doc"]
    assert stored["type"] == "doc"
    assert stored["content"][0]["type"] == "heading"
    assert stored["content"][0]["attrs"]["level"] == 2
    assert stored["content"][0]["content"][0]["text"] == "hello"


async def test_json_create_returns_derived_html(client, db_session, json_write):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    res = await client.post(
        base,
        json={"title": "From JSON", "content": _DOC_JSON, "content_format": "json"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["content"] == _DOC_HTML
    assert body["content_format"] == "html"
    assert "content_json" not in body

    db_session.expire_all()
    row = await db_session.get(Page, body["id"])
    assert row.content_json is not None
    assert row.content_json["schema"] == "gigsnano.doc"
    stored = row.content_json["doc"]
    assert stored["type"] == "doc"
    assert stored["content"][0]["content"][0]["text"] == "hello"


async def test_json_patch_without_write_flag_leaves_canonical_null(client, db_session):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (await client.post(base, json={"title": "Runbook", "content": "<p>v1</p>"})).json()
    pgid = page["id"]

    res = await client.patch(
        f"{base}{pgid}/",
        json={"content": _DOC_JSON, "content_format": "json"},
    )
    assert res.status_code == 200
    assert res.json()["content"] == _DOC_HTML

    db_session.expire_all()
    row = await db_session.get(Page, pgid)
    assert row.content == _DOC_HTML
    assert row.content_json is None


async def test_html_patch_with_write_flag_clears_canonical(client, db_session, json_write):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (
        await client.post(
            base,
            json={"title": "Runbook", "content": _DOC_JSON, "content_format": "json"},
        )
    ).json()
    pgid = page["id"]

    db_session.expire_all()
    assert (await db_session.get(Page, pgid)).content_json is not None

    html = "<p>edited in tip tap</p>"
    res = await client.patch(f"{base}{pgid}/", json={"content": html})
    assert res.status_code == 200
    assert res.json()["content"] == html

    db_session.expire_all()
    row = await db_session.get(Page, pgid)
    assert row.content == html
    assert row.content_json is None


async def test_json_patch_preserves_atomic_stale_guard(client, json_write):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (await client.post(base, json={"title": "Runbook", "content": "<p>v1</p>"})).json()
    pgid, loaded_updated_at = page["id"], page["updated_at"]

    first = await client.patch(
        f"{base}{pgid}/",
        json={
            "content": _DOC_JSON,
            "content_format": "json",
            "if_updated_at": loaded_updated_at,
        },
    )
    assert first.status_code == 200
    assert first.json()["content"] == _DOC_HTML

    stale = await client.patch(
        f"{base}{pgid}/",
        json={
            "content": json.dumps({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "stale"}],
                }],
            }),
            "content_format": "json",
            "if_updated_at": loaded_updated_at,
        },
    )
    assert stale.status_code == 409
    assert (await client.get(f"{base}{pgid}/")).json()["content"] == _DOC_HTML


async def test_page_out_prefers_canonical_when_read_flag_on(
    client, db_session, json_write, json_read
):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/pages/"
    page = (
        await client.post(
            base,
            json={"title": "Runbook", "content": _DOC_JSON, "content_format": "json"},
        )
    ).json()
    pgid = page["id"]

    db_session.expire_all()
    row = await db_session.get(Page, pgid)
    row.content = "<p>stale legacy html</p>"
    await db_session.commit()

    fetched = (await client.get(f"{base}{pgid}/")).json()
    assert fetched["content"] == _DOC_HTML
    assert fetched["content_format"] == "html"
    assert "content_json" not in fetched
