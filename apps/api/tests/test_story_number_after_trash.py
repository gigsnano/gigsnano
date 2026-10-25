"""Repro: story_number allocation must not collide with trashed rows.

The (project_id, story_number) unique constraint counts soft-deleted rows, but
the max() lookup runs through the global soft-delete filter — so trashing the
highest-numbered item made every later create in that project 409 forever.
"""
from tests.test_stories import _new_story, setup_project


async def test_create_after_trashing_highest_numbered_item(client):
    project = await setup_project(client)
    top = await _new_story(client, project["id"], title="Top")

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{top['id']}/"
    )
    assert res.status_code == 200

    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Next"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["story_number"] != top["story_number"]
