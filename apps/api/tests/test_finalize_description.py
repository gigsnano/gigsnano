from gigsnano_api.bmad.provider import FakeProvider
from tests.helpers import by_workflow, sprint_zero

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh", "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}
DESC = {"title": "Login", "markdown": "## Summary\n\n- email + Google sign-in\n- cookie sessions"}


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def unlocked_prd(client, project_id):
    """PRD is locked until the non-LLM track-selection step is marked done."""
    stories = await sprint_zero(client, project_id)
    track = by_workflow(stories, "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{track['id']}/",
        json={"status": "done"},
    )
    return by_workflow(await sprint_zero(client, project_id), "bmad-prd")


async def test_finalize_description_writes_html_without_completing_story(app, client):
    app.state.llm_provider = FakeProvider(extractions=[DESC])
    project = await setup(client)
    prd = await unlocked_prd(client, project["id"])
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")

    res = await client.post(f"{base}/thread/finalize-description/")
    assert res.status_code == 200
    story = res.json()["story"]
    # Distilled to HTML (rendered by the frontend TipTap editor), story stays TODO.
    assert story["description"] == (
        "<h2>Summary</h2><ul><li>email + Google sign-in</li><li>cookie sessions</li></ul>"
    )
    assert story["status"] == "todo"
    # No artifact/document was created and the thread stays usable.
    docs = (await client.get("/api/workspaces/acme/documents/")).json()
    assert docs == []
    assert (await client.get(f"{base}/thread/")).json()["state"] == "conversing"


async def test_finalize_description_keyless_dev_placeholder(app, client):
    # No scripted extractions → FakeProvider synthesizes a schema-valid placeholder,
    # so keyless local dev produces a real (canned) description instead of 502ing.
    app.state.llm_provider = FakeProvider()
    project = await setup(client)
    prd = await unlocked_prd(client, project["id"])
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")

    res = await client.post(f"{base}/thread/finalize-description/")
    assert res.status_code == 200
    assert res.json()["story"]["description"].startswith("<h1>Draft Artifact</h1>")


async def test_finalize_description_extraction_exhausted_502(app, client):
    bad = {"title": "x"}  # missing markdown → always schema-invalid
    app.state.llm_provider = FakeProvider(extractions=[bad, bad, bad])
    project = await setup(client)
    prd = await unlocked_prd(client, project["id"])
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")

    res = await client.post(f"{base}/thread/finalize-description/")
    assert res.status_code == 502


async def test_finalize_description_requires_open_thread(app, client):
    app.state.llm_provider = FakeProvider(extractions=[DESC])
    project = await setup(client)
    prd = await unlocked_prd(client, project["id"])
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"

    res = await client.post(f"{base}/thread/finalize-description/")
    assert res.status_code == 404
