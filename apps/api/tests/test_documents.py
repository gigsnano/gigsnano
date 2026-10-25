from gigsnano_api.bmad.provider import FakeProvider

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh", "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}


async def finalize_prd(app, client):
    app.state.llm_provider = FakeProvider(
        extractions=[{"title": "PRD — Mobile App", "markdown": "# PRD\n\nFR-1 ..."}]
    )
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()
    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/"
        )
    ).json()
    track = next(s for s in stories if s["bmad"]["workflow"] == "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = next(s for s in stories if s["bmad"]["workflow"] == "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    return project, (await client.post(f"{base}/thread/finalize/")).json()


async def test_finalize_returns_document_and_list_shows_it(app, client):
    project, result = await finalize_prd(app, client)
    doc = result["document"]
    assert doc["kind"] == "prd"
    assert doc["workflow"] == "bmad-prd"
    assert doc["is_draft"] is False
    assert doc["project_name"] == "Mobile App"
    assert doc["source"] == "agent"  # workflow-generated → AI badge
    assert set(doc) == {
        "id", "workspace_slug", "project_id", "project_name", "title", "kind",
        "workflow", "content", "comments", "is_draft", "created_at", "updated_at",
        "source", "story_id", "workspace_path", "file_name", "mime_type",
    }

    docs = (await client.get("/api/workspaces/acme/documents/")).json()
    assert [d["id"] for d in docs] == [doc["id"]]


async def test_create_and_update_user_document(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()
    res = await client.post("/api/workspaces/acme/documents/", json={
        "title": "Meeting Notes", "project_id": project["id"], "kind": "other",
    })
    assert res.status_code == 201
    doc = res.json()
    assert doc["kind"] == "other" and doc["workflow"] is None
    assert doc["source"] == "user"  # no workflow → user-authored document

    res = await client.patch(
        f"/api/workspaces/acme/documents/{doc['id']}/", json={"content": "# Notes"}
    )
    assert res.json()["content"] == "# Notes"


async def test_comments_add_and_resolve(app, client):
    _, result = await finalize_prd(app, client)
    doc_id = result["document"]["id"]
    res = await client.post(
        f"/api/workspaces/acme/documents/{doc_id}/comments/",
        json={"block_index": 2, "body": "Tighten FR-1", "assignee": "Architect · Winston"},
    )
    assert res.status_code == 201
    comment = res.json()
    assert comment["resolved"] is False
    assert comment["author_name"] == "Ada Lovelace"
    # Frontend IDocumentComment key is document_id, never the ORM's artifact_id.
    assert comment["document_id"] == doc_id
    assert "artifact_id" not in comment

    res = await client.patch(
        f"/api/workspaces/acme/documents/{doc_id}/comments/{comment['id']}/",
        json={"resolved": True},
    )
    assert res.json()["resolved"] is True

    doc = (await client.get(f"/api/workspaces/acme/documents/{doc_id}/")).json()
    assert len(doc["comments"]) == 1
