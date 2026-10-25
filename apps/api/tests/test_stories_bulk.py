"""GIN-382: bulk work-item update — dry run, per-item results, field preservation,
governance (BMAD locks) and permissions."""

from tests.helpers import by_workflow, sprint_zero
from tests.test_stories import setup_project


def _bulk_url(project_id: str) -> str:
    return f"/api/workspaces/acme/projects/{project_id}/stories/bulk-update/"


async def _story(client, project, title: str, **fields) -> dict:
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": title, "priority": "high", **fields},
        )
    ).json()


async def _fetch(client, code: str) -> dict:
    return (await client.get(f"/api/workspaces/acme/stories/resolve/{code}")).json()


async def test_bulk_update_dry_run_then_apply(client):
    project = await setup_project(client)
    one = await _story(client, project, "Card capture")
    two = await _story(client, project, "Refunds")

    preview = (
        await client.post(_bulk_url(project["id"]), json={
            "codes": [one["code"], two["code"]],
            "changes": {"status": "in_progress"},
            "dry_run": True,
        })
    ).json()
    assert preview["counts"]["updated"] == 2
    assert preview["updated"][0]["previous"] == {"status": "todo"}
    assert preview["updated"][0]["proposed"] == {"status": "in_progress"}
    assert (await _fetch(client, one["code"]))["status"] == "todo"  # nothing written

    result = (
        await client.post(_bulk_url(project["id"]), json={
            "codes": [one["code"], two["code"], "MBA-9999", "WEB-1", "junk"],
            "changes": {"status": "in_progress"},
        })
    ).json()
    assert result["counts"] == {"updated": 2, "unchanged": 0, "failed": 3}
    assert {f["error"] for f in result["failed"]} == {"not_found", "cross_project", "bad_code"}
    assert result["correlation_id"]

    stored = await _fetch(client, one["code"])
    assert stored["status"] == "in_progress"
    assert stored["priority"] == "high" and stored["title"] == one["title"]  # untouched

    # Idempotent: re-running reports the items as unchanged rather than rewriting.
    again = (
        await client.post(_bulk_url(project["id"]), json={
            "codes": [one["code"]], "changes": {"status": "in_progress"},
        })
    ).json()
    assert again["counts"] == {"updated": 0, "unchanged": 1, "failed": 0}


async def test_bulk_update_validates_refs_and_requires_changes(client):
    project = await setup_project(client)
    one = await _story(client, project, "Card capture")

    empty = await client.post(_bulk_url(project["id"]), json={
        "codes": [one["code"]], "changes": {},
    })
    assert empty.status_code == 400
    assert empty.json()["detail"]["error_code"] == "no_changes"

    # A cycle from another project cannot be assigned through the bulk path.
    other = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Web", "identifier": "WEB", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    foreign_cycle = (
        await client.post(
            f"/api/workspaces/acme/projects/{other['id']}/cycles/", json={"name": "Sprint 1"}
        )
    ).json()
    res = await client.post(_bulk_url(project["id"]), json={
        "codes": [one["code"]], "changes": {"cycle_id": foreign_cycle["id"]},
    })
    assert res.status_code == 404

    res = await client.post(_bulk_url(project["id"]), json={
        "codes": [one["code"]], "changes": {"assignee_id": "not-a-member"},
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error_code"] == "invalid_assignee"


async def test_bulk_update_respects_bmad_locks(client):
    """A locked Sprint-0 card cannot be progressed in bulk either — it is reported,
    and the unlocked items in the same request still move."""
    project = await setup_project(client)
    stories = await sprint_zero(client, project["id"])
    locked = by_workflow(stories, "bmad-prd")
    open_card = by_workflow(stories, "track-selection")

    result = (
        await client.post(_bulk_url(project["id"]), json={
            "codes": [locked["code"], open_card["code"]],
            "changes": {"status": "in_progress"},
        })
    ).json()
    assert result["counts"]["updated"] == 1
    assert result["failed"] == [{"code": locked["code"], "error": "bmad_locked"}]
    assert (await _fetch(client, locked["code"]))["status"] == locked["status"]


async def test_viewer_cannot_bulk_update(client):
    from tests.test_project_viewer_readonly import _sign_in, setup_project_with_alan

    project = await setup_project_with_alan(client, "viewer")
    story = await _story(client, project, "Card capture")
    await _sign_in(client, "alan@example.test")
    res = await client.post(_bulk_url(project["id"]), json={
        "codes": [story["code"]], "changes": {"status": "in_progress"},
    })
    assert res.status_code == 403
