from gigsnano_api.bmad.provider import FakeProvider
from tests.helpers import by_workflow, sprint_zero

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh", "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}
DOC = {"title": "PRD", "markdown": "# PRD\nFR-1 ..."}


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def complete_direct(client, project_id, story_id):
    await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{story_id}/",
        json={"status": "done"},
    )


async def test_delete_user_document(app, client):
    project = await setup(client)
    doc = (await client.post("/api/workspaces/acme/documents/", json={
        "title": "Notes", "project_id": project["id"], "kind": "other", "content": "# Notes"})).json()
    res = await client.delete(f"/api/workspaces/acme/documents/{doc['id']}/")
    assert res.status_code == 200 and res.json() == {"success": True}
    assert (await client.get(f"/api/workspaces/acme/documents/{doc['id']}/")).status_code == 404


async def test_delete_agent_document_forbidden(app, client):
    app.state.llm_provider = FakeProvider(extractions=[{"title": "PRD", "markdown": "# PRD"}])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    artifact_id = (await client.post(f"{base}/thread/finalize/")).json()["artifact_id"]
    res = await client.delete(f"/api/workspaces/acme/documents/{artifact_id}/")
    assert res.status_code == 403


async def _story_with_attachment(client, project_id, file_name="report.pdf"):
    """A work item plus one uploaded attachment, via the real upload route."""
    story = (await client.post(
        f"/api/workspaces/acme/projects/{project_id}/stories/",
        json={"title": "Ship it"},
    )).json()
    doc = (await client.post(
        f"/api/workspaces/acme/projects/{project_id}/stories/{story['id']}/documents/",
        json={
            "title": file_name, "project_id": project_id, "story_id": story["id"],
            "file_name": file_name, "mime_type": "text/markdown", "content": "# Report",
        },
    )).json()
    return story, doc


async def test_delete_through_the_work_item_it_belongs_to(app, client):
    """GIN-402: the happy path, plus the audit entry it must leave behind."""
    project = await setup(client)
    story, doc = await _story_with_attachment(client, project["id"])

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}"
        f"/documents/{doc['id']}/"
    )
    assert res.status_code == 200, res.text
    listing = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/"
    )
    assert listing.json() == []

    activity = (await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/activity/")).json()
    rows = activity["items"] if isinstance(activity, dict) else activity
    entries = [a["action"] for a in rows]
    assert any("deleted attachment 'report.pdf'" in a for a in entries)
    # The audit says what was deleted, never what was in it.
    assert not any("# Report" in a for a in entries)


async def test_cannot_delete_an_attachment_belonging_to_another_work_item(app, client):
    """GIN-402 AC7. The workspace-scoped route only proves project access, so this
    is the check that makes a cross-item id a 404 rather than a deletion."""
    project = await setup(client)
    story_a, doc_a = await _story_with_attachment(client, project["id"], "a.md")
    story_b, _ = await _story_with_attachment(client, project["id"], "b.md")

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story_b['id']}"
        f"/documents/{doc_a['id']}/"
    )
    assert res.status_code == 404
    # Still there — a rejected delete changes nothing.
    listing = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story_a['id']}/documents/"
    )
    assert [d["id"] for d in listing.json()] == [doc_a["id"]]


async def test_duplicate_file_names_delete_the_right_one(app, client):
    """GIN-402 AC8: deletion is by immutable id, so a same-named sibling survives."""
    project = await setup(client)
    story, first = await _story_with_attachment(client, project["id"], "report.pdf")
    second = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/",
        json={
            "title": "report.pdf", "project_id": project["id"], "story_id": story["id"],
            "file_name": "report.pdf", "mime_type": "text/markdown", "content": "# Second",
        },
    )).json()

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}"
        f"/documents/{first['id']}/"
    )
    assert res.status_code == 200
    remaining = (await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/"
    )).json()
    assert [d["id"] for d in remaining] == [second["id"]]


async def test_repeat_delete_is_not_a_500(app, client):
    """GIN-402: an attachment already deleted in another session."""
    project = await setup(client)
    story, doc = await _story_with_attachment(client, project["id"])
    path = (
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}"
        f"/documents/{doc['id']}/"
    )
    assert (await client.delete(path)).status_code == 200
    assert (await client.delete(path)).status_code == 404


async def test_upload_and_read_still_work_after_a_deletion(app, client):
    """GIN-406 AC5: the regression guard. Deleting one attachment must not break
    uploading, listing or reading the next one."""
    project = await setup(client)
    story, first = await _story_with_attachment(client, project["id"], "old.md")
    await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}"
        f"/documents/{first['id']}/"
    )

    second = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/",
        json={
            "title": "new.md", "project_id": project["id"], "story_id": story["id"],
            "file_name": "new.md", "mime_type": "text/markdown", "content": "# New",
        },
    )
    assert second.status_code == 201, second.text

    listing = (await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/"
    )).json()
    assert [d["file_name"] for d in listing] == ["new.md"]
    fetched = await client.get(f"/api/workspaces/acme/documents/{second.json()['id']}/")
    assert fetched.status_code == 200 and "# New" in fetched.json()["content"]
