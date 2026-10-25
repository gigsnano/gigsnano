from gigsnano_api.features.story_drafts import service as DS
from gigsnano_api.models import StoryDraft


async def test_story_draft_persists(db_session, make_project, make_user):
    project = await make_project()
    user = make_user()
    db_session.add(user)
    await db_session.flush()
    d = StoryDraft(
        workspace_id=project.workspace_id, project_id=project.id,
        created_by_id=user.id, title="My draft", payload={"title": "My draft", "type": "bug"},
    )
    db_session.add(d)
    await db_session.commit()
    got = await db_session.get(StoryDraft, d.id)
    assert got.title == "My draft"
    assert got.payload["type"] == "bug"


async def test_service_create_and_list_scoped_to_user(db_session, make_project, make_user):
    project = await make_project()
    u1, u2 = make_user(email="a@x.test"), make_user(email="b@x.test")
    db_session.add_all([u1, u2])
    await db_session.flush()
    await DS.create_draft(db_session, workspace_id=project.workspace_id,
                          project_id=project.id, user_id=u1.id, title="A", payload={"title": "A"})
    await db_session.commit()
    mine = await DS.list_my_drafts(db_session, project.workspace_id, u1.id)
    theirs = await DS.list_my_drafts(db_session, project.workspace_id, u2.id)
    assert [d.title for d in mine] == ["A"]
    assert theirs == []


async def _acme(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    proj = await client.post("/api/workspaces/acme/projects/", json={
        "name": "P", "identifier": "P", "flow": "fresh", "has_ui": True,
        "cover_image_url": "https://img.test/c.jpg"})
    return proj.json()["id"]


async def test_draft_crud_roundtrip(client):
    pid = await _acme(client)
    created = await client.post(f"/api/workspaces/acme/projects/{pid}/drafts/",
                                json={"title": "Draft A", "payload": {"title": "Draft A", "type": "bug"}})
    assert created.status_code == 201
    did = created.json()["id"]

    listed = (await client.get("/api/workspaces/acme/drafts/")).json()
    assert [d["id"] for d in listed] == [did]
    assert listed[0]["payload"]["type"] == "bug"

    # a draft must NOT appear as a real story
    stories = (await client.get(f"/api/workspaces/acme/projects/{pid}/stories/")).json()
    assert all(s["title"] != "Draft A" for s in stories["items"])

    patched = await client.patch(f"/api/workspaces/acme/drafts/{did}/",
                                 json={"title": "Draft B", "payload": {"title": "Draft B"}})
    assert patched.json()["title"] == "Draft B"

    assert (await client.delete(f"/api/workspaces/acme/drafts/{did}/")).status_code == 200
    assert (await client.get("/api/workspaces/acme/drafts/")).json() == []
