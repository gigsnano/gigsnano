"""GIN-475: a work item carries many labels.

Covers the acceptance criteria that aren't obvious from the endpoint shape: add
without losing, remove without losing, duplicate prevention, filtering by one
label when an item holds several, and the legacy singular still working.
"""

from sqlalchemy import select

from gigsnano_api.features.stories.labels import (
    normalize_label_ids,
    set_story_labels,
)
from gigsnano_api.models import StoryLabel
from tests.test_gigs_ai import setup_ws

CREATE_PROJECT = {
    "name": "Web", "identifier": "WEB", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def _project(client) -> dict:
    await setup_ws(client)
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


async def _label(client, pid: str, name: str, color: str = "#ef4444") -> dict:
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{pid}/labels/", json={"name": name, "color": color}
        )
    ).json()


async def _story(client, pid: str, **extra) -> dict:
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{pid}/stories/", json={"title": "Item", **extra}
        )
    ).json()


def test_normalize_drops_blanks_and_duplicates():
    assert normalize_label_ids(["a", "", "b", "a", "  ", "b"]) == ["a", "b"]
    assert normalize_label_ids(None) == []


async def test_three_labels_add_and_remove_independently(client):
    project = await _project(client)
    pid = project["id"]
    a = await _label(client, pid, "bug")
    b = await _label(client, pid, "urgent")
    c = await _label(client, pid, "backend")
    story = await _story(client, pid)
    url = f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/"

    res = await client.patch(url, json={"label_ids": [a["id"], b["id"], c["id"]]})
    assert res.status_code == 200
    assert set(res.json()["label_ids"]) == {a["id"], b["id"], c["id"]}

    # Removing one leaves the others alone.
    res = await client.patch(url, json={"label_ids": [a["id"], c["id"]]})
    assert set(res.json()["label_ids"]) == {a["id"], c["id"]}

    # A PATCH that doesn't mention labels must not touch them.
    res = await client.patch(url, json={"title": "Renamed"})
    assert set(res.json()["label_ids"]) == {a["id"], c["id"]}
    assert res.json()["title"] == "Renamed"

    # Clearing is an explicit empty list.
    res = await client.patch(url, json={"label_ids": []})
    assert res.json()["label_ids"] == []


async def test_duplicate_ids_collapse_to_one_row(client, db_session):
    project = await _project(client)
    pid = project["id"]
    a = await _label(client, pid, "bug")
    story = await _story(client, pid)

    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
        json={"label_ids": [a["id"], a["id"], a["id"]]},
    )
    assert res.json()["label_ids"] == [a["id"]]
    rows = (
        await db_session.execute(select(StoryLabel).where(StoryLabel.story_id == story["id"]))
    ).scalars().all()
    assert len(rows) == 1


async def test_labels_survive_a_refetch_and_are_created_with_the_item(client):
    project = await _project(client)
    pid = project["id"]
    a = await _label(client, pid, "bug")
    b = await _label(client, pid, "urgent")

    story = await _story(client, pid, label_ids=[a["id"], b["id"]])
    assert set(story["label_ids"]) == {a["id"], b["id"]}

    refetched = (
        await client.get(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/")
    ).json()
    assert set(refetched["label_ids"]) == {a["id"], b["id"]}


async def test_filtering_by_one_label_matches_items_holding_several(client):
    """The core regression: `label_id=<bug>` must return the item that has bug
    AND urgent, not just the one whose only label is bug."""
    project = await _project(client)
    pid = project["id"]
    bug = await _label(client, pid, "bug")
    urgent = await _label(client, pid, "urgent")

    only_bug = await _story(client, pid, label_ids=[bug["id"]])
    both = await _story(client, pid, label_ids=[bug["id"], urgent["id"]])
    await _story(client, pid, label_ids=[urgent["id"]])

    res = await client.get(
        f"/api/workspaces/acme/projects/{pid}/stories/", params={"label_id": bug["id"]}
    )
    ids = {s["id"] for s in res.json()["items"]}
    assert ids == {only_bug["id"], both["id"]}


async def test_legacy_singular_label_id_still_writes_and_reads(client):
    """Older clients and stored automations/templates keep working (GIN-475)."""
    project = await _project(client)
    pid = project["id"]
    a = await _label(client, pid, "bug")
    story = await _story(client, pid)
    url = f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/"

    res = await client.patch(url, json={"label_id": a["id"]})
    assert res.json()["label_ids"] == [a["id"]]
    assert res.json()["label_id"] == a["id"]  # derived singular

    # An explicit null clears, rather than being read as "leave alone".
    res = await client.patch(url, json={"label_id": None})
    assert res.json()["label_ids"] == [] and res.json()["label_id"] is None


async def test_foreign_project_label_is_rejected_by_name(client):
    project = await _project(client)
    pid = project["id"]
    other = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={**CREATE_PROJECT, "name": "Other", "identifier": "OTH"},
        )
    ).json()
    foreign = await _label(client, other["id"], "nope")
    mine = await _label(client, pid, "bug")
    story = await _story(client, pid)

    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
        json={"label_ids": [mine["id"], foreign["id"]]},
    )
    assert res.status_code == 400
    assert foreign["id"] in res.json()["detail"]  # says WHICH one


async def test_set_story_labels_reports_only_real_changes(db_session, client):
    project = await _project(client)
    pid = project["id"]
    a = await _label(client, pid, "bug")
    story = await _story(client, pid, label_ids=[a["id"]])

    # Same set in a different order is not a change — no history row should follow.
    assert await set_story_labels(db_session, story["id"], [a["id"]]) is None
