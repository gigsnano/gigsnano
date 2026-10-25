CREATE = {
    "name": "Mobile Banking App", "identifier": "MBA", "flow": "fresh",
    "has_ui": True, "cover_image_url": "https://img.test/c.jpg",
}


async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_logo_image_url_roundtrips_create_and_update(client):
    # GIN-44: a project can carry an uploaded logo image URL, set at create and
    # changed via PATCH, and it comes back in the serialized project.
    await setup_ws(client)
    url = "/api/workspaces/acme/images/abc123/"
    created = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={**CREATE, "logo_image_url": url},
        )
    ).json()
    assert created["logo_image_url"] == url

    patched = (
        await client.patch(
            f"/api/workspaces/acme/projects/{created['id']}/",
            json={"logo_image_url": "/api/workspaces/acme/images/def456/"},
        )
    ).json()
    assert patched["logo_image_url"] == "/api/workspaces/acme/images/def456/"

    # Omitted on create → null (default).
    plain = (
        await client.post(
            "/api/workspaces/acme/projects/", json={**CREATE, "identifier": "PLN"}
        )
    ).json()
    assert plain["logo_image_url"] is None


async def test_create_project_seeds_sprint_zero(client):
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/projects/", json=CREATE)
    assert res.status_code == 201
    project = res.json()
    assert project["sprint_zero_status"] == "not_started"
    assert project["member_count"] == 1  # creator auto-added as project admin
    assert project["lead_id"] is not None

    cycles = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")).json()
    assert len(cycles) == 1
    assert cycles[0]["is_sprint_zero"] is True
    assert cycles[0]["story_count"] == 10  # fresh flow with UI

    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    assert [s["order"] for s in stories] == list(range(10))
    assert stories[0]["bmad"]["is_locked"] is False   # track-selection
    assert stories[4]["bmad"]["is_locked"] is True    # bmad-prd


async def test_create_project_no_ui_omits_ux_story(client):
    await setup_ws(client)
    res = await client.post(
        "/api/workspaces/acme/projects/", json={**CREATE, "identifier": "API", "has_ui": False}
    )
    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{res.json()['id']}/sprint-zero/stories/"
        )
    ).json()
    assert len(stories) == 9
    assert all(s["bmad"]["workflow"] != "bmad-ux" for s in stories)


async def test_brownfield_flow_uses_brownfield_steps(client):
    await setup_ws(client)
    res = await client.post(
        "/api/workspaces/acme/projects/",
        json={**CREATE, "identifier": "LEG", "flow": "existing"},
    )
    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{res.json()['id']}/sprint-zero/stories/"
        )
    ).json()
    assert stories[0]["bmad"]["workflow"] == "cleanup-artifacts"


async def test_duplicate_identifier_conflicts(client):
    await setup_ws(client)
    await client.post("/api/workspaces/acme/projects/", json=CREATE)
    res = await client.post("/api/workspaces/acme/projects/", json=CREATE)
    assert res.status_code == 409
    assert res.json()["detail"] == (
        'Project code "MBA" is already used by another project in this workspace. '
        "Choose a different code."
    )


async def test_same_identifier_allowed_in_another_workspace(client):
    # Uniqueness is per workspace: another workspace's codes are irrelevant.
    await setup_ws(client)
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.post("/api/workspaces/acme/projects/", json=CREATE)).status_code == 201
    assert (await client.post("/api/workspaces/beta/projects/", json=CREATE)).status_code == 201


async def test_renaming_identifier_to_a_taken_code_conflicts(client):
    await setup_ws(client)
    await client.post("/api/workspaces/acme/projects/", json=CREATE)
    other = (
        await client.post("/api/workspaces/acme/projects/", json={**CREATE, "identifier": "OTH"})
    ).json()
    url = f"/api/workspaces/acme/projects/{other['id']}/"
    res = await client.patch(url, json={"identifier": "MBA"})
    assert res.status_code == 409
    assert 'Project code "MBA"' in res.json()["detail"]
    # Re-sending its own code is not a clash.
    assert (await client.patch(url, json={"identifier": "OTH"})).status_code == 200


async def test_patch_project_overview_and_activity(client):
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/",
        json={"overview": "<p>Vision</p>", "name": "MBA v2"},
    )
    assert res.status_code == 200
    assert res.json()["overview"] == "<p>Vision</p>"
    assert res.json()["name"] == "MBA v2"

    activity = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/activity/")
    ).json()
    assert activity[0]["actor_name"] == "Ada Lovelace"  # newest first
    assert {a["type"] for a in activity} == {"created", "updated"}


async def test_description_edits_coalesce_and_skip_noops(client):
    """GIN-11: autosave must not flood the feed — real edits coalesce, no-ops skip."""
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    url = f"/api/workspaces/acme/projects/{project['id']}/"

    async def activity_types():
        rows = (await client.get(f"{url}activity/")).json()
        return [r["type"] for r in rows]  # newest first

    # First real prose edit logs exactly one "description" row.
    await client.patch(url, json={"overview": "<p>A</p>"})
    assert await activity_types() == ["description", "created"]

    # A burst of follow-up edits folds into that same row — no new rows.
    await client.patch(url, json={"overview": "<p>AB</p>"})
    await client.patch(url, json={"overview": "<p>ABC</p>"})
    assert await activity_types() == ["description", "created"]

    # A no-op autosave (value unchanged) logs nothing at all.
    await client.patch(url, json={"overview": "<p>ABC</p>"})
    assert await activity_types() == ["description", "created"]


async def test_workspace_project_count_wired(client):
    await setup_ws(client)
    await client.post("/api/workspaces/acme/projects/", json=CREATE)
    ws = (await client.get("/api/workspaces/acme/")).json()
    assert ws["project_count"] == 1


async def test_delete_project(client):
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    res = await client.delete(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.json() == {"success": True}
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.status_code == 404


async def test_delete_project_requires_admin(client):
    """A plain (non-admin/owner) workspace member must not be able to delete a project."""
    alan = (
        await client.post("/api/auth/sign-up/", json={
            "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
        })
    ).json()
    await client.post("/api/auth/sign-out/")
    await setup_ws(client)  # Ada owns "acme"
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    alan_member = (
        await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    ).json()
    assert alan_member["status"] == "active" and alan_member["role"] == "member"
    # Add Alan as a project member (but not admin) to test that the endpoint gate checks admin role
    await client.post(f"/api/workspaces/acme/projects/{project['id']}/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )

    res = await client.delete(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.status_code == 403


async def test_toggle_has_ui_off_recomputes_ux_lock(client):
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    ux = next(s for s in stories if s["bmad"]["workflow"] == "bmad-ux")
    assert ux["bmad"]["skipped"] is False

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/", json={"has_ui": False}
    )
    assert res.status_code == 200
    assert res.json()["has_ui"] is False

    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    ux = next(s for s in stories if s["bmad"]["workflow"] == "bmad-ux")
    assert ux["bmad"]["is_locked"] is True
    assert ux["bmad"]["skipped"] is True


async def test_target_date_must_not_precede_start_date(client):
    # GIN-487: the pair is validated post-patch, so moving either date is checked
    # against the other's stored value.
    await setup_ws(client)
    project = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={**CREATE, "start_date": "2026-07-01", "target_date": "2026-07-31"},
        )
    ).json()
    url = f"/api/workspaces/acme/projects/{project['id']}/"

    assert (await client.patch(url, json={"target_date": "2026-06-01"})).status_code == 400
    assert (await client.patch(url, json={"start_date": "2026-08-15"})).status_code == 400
    assert (await client.patch(url, json={"start_date": "2026-07-31"})).status_code == 200  # equal
    both = await client.patch(url, json={"start_date": "2027-01-01", "target_date": "2027-03-01"})
    assert both.status_code == 200
    assert (both.json()["start_date"], both.json()["target_date"]) == ("2027-01-01", "2027-03-01")


async def test_blank_project_creates_no_work_items(client):
    # A blank project is just the container: no Sprint-0 cycle, no seeded stories.
    await setup_ws(client)
    res = await client.post(
        "/api/workspaces/acme/projects/", json={**CREATE, "identifier": "BLK", "blank": True}
    )
    assert res.status_code == 201
    pid = res.json()["id"]
    assert (await client.get(f"/api/workspaces/acme/projects/{pid}/cycles/")).json() == []
    stories = await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")
    assert stories.json() == []
