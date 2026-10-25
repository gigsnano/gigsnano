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


async def test_story_documents_returns_finalized_artifact_for_that_story(app, client):
    app.state.llm_provider = FakeProvider(extractions=[DOC])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    track = by_workflow(stories, "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    await client.post(f"{base}/thread/finalize/")

    res = await client.get(f"{base}/documents/")
    assert res.status_code == 200
    docs = res.json()
    assert len(docs) == 1
    assert docs[0]["title"] == "PRD"
    assert docs[0]["kind"] == "prd"
    assert docs[0]["workflow"] == "bmad-prd"
    # Frontend keys badge styling off `source` and crashes without it; a
    # workflow-generated artifact is an agent document scoped to its story.
    assert docs[0]["source"] == "agent"
    assert docs[0]["story_id"] == prd["id"]

    # A sibling story that produced nothing yet returns an empty list (not 404).
    arch = by_workflow(await sprint_zero(client, project["id"]), "bmad-create-architecture")
    other = f"/api/workspaces/acme/projects/{project['id']}/stories/{arch['id']}/documents/"
    assert (await client.get(other)).json() == []


async def test_story_documents_unknown_story_404(app, client):
    app.state.llm_provider = FakeProvider()
    project = await setup(client)
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/nope/documents/"
    )
    assert res.status_code == 404
