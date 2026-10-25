from gigsnano_api.models import ECustomFieldType, ProjectCustomField, StoryCustomFieldValue


def test_custom_field_models_construct():
    f = ProjectCustomField(
        project_id="p1", name="Team", field_type=ECustomFieldType.SELECT,
        options=["A", "B"], sort_order=1.0,
    )
    assert f.field_type == ECustomFieldType.SELECT and f.options == ["A", "B"]
    v = StoryCustomFieldValue(story_id="s1", field_id="f1", value="A")
    assert v.value == "A"


async def _owner_project(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={
                "name": "P", "identifier": "P1", "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            },
        )
    ).json()
    return p


async def test_custom_field_crud(client):
    p = await _owner_project(client)
    base = f"/api/workspaces/acme/projects/{p['id']}/custom-fields/"
    r = await client.post(base, json={"name": "Team", "field_type": "select", "options": ["A", "B"]})
    assert r.status_code == 201 and r.json()["field_type"] == "select"
    fid = r.json()["id"]
    assert (await client.get(base)).json()[0]["name"] == "Team"
    # unique name
    assert (await client.post(base, json={"name": "Team", "field_type": "text"})).status_code == 409
    # select requires options
    assert (await client.post(base, json={"name": "Prio", "field_type": "select"})).status_code == 400
    # non-select must not send options
    assert (
        await client.post(
            base, json={"name": "Owner", "field_type": "text", "options": ["A"]}
        )
    ).status_code == 400
    # type immutable
    assert (await client.patch(f"{base}{fid}/", json={"field_type": "text"})).status_code == 400
    # rename ok
    assert (await client.patch(f"{base}{fid}/", json={"name": "Squad"})).json()["name"] == "Squad"
    # delete
    assert (await client.delete(f"{base}{fid}/")).status_code == 200
    assert (await client.get(base)).json() == []


async def _setup_project_with_viewer(client) -> dict:
    """Ada owns workspace 'acme' + project 'P'; Alan is added to the project as
    a VIEWER. Mirrors tests/test_project_viewer_readonly.py's setup pattern."""
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!"},
    )
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    alan_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    project = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={
                "name": "P", "identifier": "P1", "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            },
        )
    ).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"], "role": "viewer"},
    )
    assert res.status_code == 201
    return project


async def test_custom_field_viewer_forbidden(client):
    project = await _setup_project_with_viewer(client)
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/custom-fields/",
        json={"name": "Team", "field_type": "text"},
    )
    assert res.status_code == 403


async def test_story_detail_serializes_custom_fields_coerced(client, db_session):
    project = await _owner_project(client)
    project_id = project["id"]
    base = f"/api/workspaces/acme/projects/{project_id}/custom-fields/"
    f_num = (await client.post(base, json={"name": "Points", "field_type": "number"})).json()
    f_num_float = (await client.post(base, json={"name": "Hours", "field_type": "number"})).json()
    f_date = (await client.post(base, json={"name": "Due", "field_type": "date"})).json()
    f_select = (
        await client.post(
            base, json={"name": "Team", "field_type": "select", "options": ["A", "B"]}
        )
    ).json()

    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project_id}/stories/",
            json={"title": "Story 1"},
        )
    ).json()

    db_session.add_all(
        [
            StoryCustomFieldValue(story_id=story["id"], field_id=f_num["id"], value="5"),
            StoryCustomFieldValue(story_id=story["id"], field_id=f_num_float["id"], value="5.5"),
            StoryCustomFieldValue(story_id=story["id"], field_id=f_date["id"], value="2026-01-01"),
            StoryCustomFieldValue(story_id=story["id"], field_id=f_select["id"], value="A"),
        ]
    )
    await db_session.commit()

    out = (
        await client.get(f"/api/workspaces/acme/projects/{project_id}/stories/{story['id']}/")
    ).json()
    cf = out["custom_fields"]
    assert cf[f_num["id"]] == 5
    assert cf[f_num_float["id"]] == 5.5
    assert cf[f_date["id"]] == "2026-01-01"
    assert cf[f_select["id"]] == "A"


async def test_story_list_serializes_custom_fields_batched(client, db_session):
    project = await _owner_project(client)
    project_id = project["id"]
    base = f"/api/workspaces/acme/projects/{project_id}/custom-fields/"
    field = (await client.post(base, json={"name": "Points", "field_type": "number"})).json()

    story_base = f"/api/workspaces/acme/projects/{project_id}/stories/"
    s1 = (await client.post(story_base, json={"title": "S1"})).json()
    s2 = (await client.post(story_base, json={"title": "S2"})).json()

    db_session.add_all(
        [
            StoryCustomFieldValue(story_id=s1["id"], field_id=field["id"], value="1"),
            StoryCustomFieldValue(story_id=s2["id"], field_id=field["id"], value="2"),
        ]
    )
    await db_session.commit()

    out = (await client.get(story_base)).json()
    items = {item["id"]: item for item in out["items"]}
    assert items[s1["id"]]["custom_fields"][field["id"]] == 1
    assert items[s2["id"]]["custom_fields"][field["id"]] == 2


async def test_update_story_sets_and_clears_custom_field_values(client):
    project = await _owner_project(client)
    project_id = project["id"]
    base = f"/api/workspaces/acme/projects/{project_id}/custom-fields/"
    f_text = (await client.post(base, json={"name": "Owner", "field_type": "text"})).json()
    f_num = (await client.post(base, json={"name": "Points", "field_type": "number"})).json()
    f_date = (await client.post(base, json={"name": "Due", "field_type": "date"})).json()
    f_select = (
        await client.post(
            base, json={"name": "Team", "field_type": "select", "options": ["A", "B"]}
        )
    ).json()

    story_base = f"/api/workspaces/acme/projects/{project_id}/stories/"
    story = (await client.post(story_base, json={"title": "Story 1"})).json()
    story_url = f"{story_base}{story['id']}/"

    r = await client.patch(
        story_url,
        json={
            "custom_fields": {
                f_text["id"]: "Alice",
                f_num["id"]: 5,
                f_date["id"]: "2026-02-01",
                f_select["id"]: "A",
            }
        },
    )
    assert r.status_code == 200
    out = (await client.get(story_url)).json()
    cf = out["custom_fields"]
    assert cf[f_text["id"]] == "Alice"
    assert cf[f_num["id"]] == 5
    assert cf[f_date["id"]] == "2026-02-01"
    assert cf[f_select["id"]] == "A"

    # clear the text value (empty string) and the number value (null); the
    # others are untouched.
    r2 = await client.patch(
        story_url,
        json={"custom_fields": {f_text["id"]: "", f_num["id"]: None}},
    )
    assert r2.status_code == 200
    out2 = (await client.get(story_url)).json()
    cf2 = out2["custom_fields"]
    assert f_text["id"] not in cf2
    assert f_num["id"] not in cf2
    assert cf2[f_date["id"]] == "2026-02-01"
    assert cf2[f_select["id"]] == "A"


async def test_update_story_custom_field_validation_errors(client):
    project = await _owner_project(client)
    project_id = project["id"]
    base = f"/api/workspaces/acme/projects/{project_id}/custom-fields/"
    f_num = (await client.post(base, json={"name": "Points", "field_type": "number"})).json()
    f_date = (await client.post(base, json={"name": "Due", "field_type": "date"})).json()
    f_select = (
        await client.post(
            base, json={"name": "Team", "field_type": "select", "options": ["A", "B"]}
        )
    ).json()

    story_base = f"/api/workspaces/acme/projects/{project_id}/stories/"
    story = (await client.post(story_base, json={"title": "Story 1"})).json()
    story_url = f"{story_base}{story['id']}/"

    assert (
        await client.patch(story_url, json={"custom_fields": {f_num["id"]: "abc"}})
    ).status_code == 400
    assert (
        await client.patch(story_url, json={"custom_fields": {f_date["id"]: "not-a-date"}})
    ).status_code == 400
    assert (
        await client.patch(story_url, json={"custom_fields": {f_select["id"]: "C"}})
    ).status_code == 400
    assert (
        await client.patch(story_url, json={"custom_fields": {"nonexistent-field-id": "x"}})
    ).status_code == 400

    # a custom field belonging to a different project is rejected too
    other = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={
                "name": "Q", "identifier": "Q1", "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            },
        )
    ).json()
    other_field = (
        await client.post(
            f"/api/workspaces/acme/projects/{other['id']}/custom-fields/",
            json={"name": "Other", "field_type": "text"},
        )
    ).json()
    assert (
        await client.patch(story_url, json={"custom_fields": {other_field["id"]: "x"}})
    ).status_code == 400
