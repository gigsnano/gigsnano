async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()


async def test_module_crud(client):
    project = await setup_project(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/modules/",
        json={"name": "Payments", "description": "Payment rails"},
    )
    assert res.status_code == 201
    module = res.json()
    assert module["status"] == "backlog"
    assert module["story_count"] == 0
    assert set(module) == {
        "id", "workspace_slug", "project_id", "name", "description", "status",
        "lead_id", "start_date", "target_date", "color",
        "story_count", "completed_story_count", "created_at", "updated_at",
    }

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/modules/{module['id']}/",
        json={"status": "in_progress"},
    )
    assert res.json()["status"] == "in_progress"

    modules = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/modules/")
    ).json()
    assert len(modules) == 1

    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/modules/{module['id']}/stories/"
        )
    ).json()
    assert stories == []


# ---- GIN-380: module management from the MCP -------------------------------


async def _module(client, project, name: str) -> dict:
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/modules/", json={"name": name}
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _story(client, project, title: str) -> dict:
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": title, "priority": "high"},
        )
    ).json()


async def _bulk(client, project, **body) -> dict:
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/modules/bulk-assign/", json=body
        )
    ).json()


async def test_module_dates_and_color(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/modules"
    module = (
        await client.post(base + "/", json={
            "name": "Payments", "start_date": "2026-08-01", "target_date": "2026-09-30",
            "color": "#6b7280",
        })
    ).json()
    assert (module["start_date"], module["target_date"], module["color"]) == (
        "2026-08-01", "2026-09-30", "#6b7280",
    )
    patched = (
        await client.patch(f"{base}/{module['id']}/", json={"target_date": "2026-10-15"})
    ).json()
    assert patched["target_date"] == "2026-10-15" and patched["start_date"] == "2026-08-01"


async def test_duplicate_module_name_rejected(client):
    project = await setup_project(client)
    await _module(client, project, "Payments")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/modules/",
        json={"name": "  payments "},  # same name, trimmed + case-insensitive
    )
    assert res.status_code == 409
    assert res.json()["detail"]["error_code"] == "duplicate_module_name"

    other = await _module(client, project, "Billing")
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/modules/{other['id']}/",
        json={"name": "Payments"},
    )
    assert res.status_code == 409
    # renaming a module to its own name is not a duplicate
    assert (
        await client.patch(
            f"/api/workspaces/acme/projects/{project['id']}/modules/{other['id']}/",
            json={"name": "Billing"},
        )
    ).status_code == 200


async def test_delete_module_strategies(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/modules"
    module = await _module(client, project, "Payments")
    spare = await _module(client, project, "Spare")
    story = await _story(client, project, "Card capture")
    await _bulk(client, project, codes=[story["code"]], module_id=module["id"])

    res = await client.delete(f"{base}/{module['id']}/")
    assert res.status_code == 409
    assert res.json()["detail"]["error_code"] == "module_has_work_items"

    res = await client.delete(f"{base}/{module['id']}/?on_work_items=move")
    assert res.status_code == 400  # move needs a target

    res = await client.delete(
        f"{base}/{module['id']}/?on_work_items=move&move_to_module_id={spare['id']}"
    )
    assert res.status_code == 200 and res.json()["work_items_affected"] == 1
    assert (
        await client.get(f"/api/workspaces/acme/stories/resolve/{story['code']}")
    ).json()["module_id"] == spare["id"]

    res = await client.delete(f"{base}/{spare['id']}/?on_work_items=unassign")
    assert res.status_code == 200
    assert (
        await client.get(f"/api/workspaces/acme/stories/resolve/{story['code']}")
    ).json()["module_id"] is None


async def test_bulk_assign_work_items(client):
    project = await setup_project(client)
    module = await _module(client, project, "Payments")
    one = await _story(client, project, "Card capture")
    two = await _story(client, project, "Refunds")

    preview = await _bulk(
        client, project, codes=[one["code"], two["code"]], module_id=module["id"], dry_run=True
    )
    assert preview["dry_run"] and preview["counts"]["updated"] == 2
    assert (
        await client.get(f"/api/workspaces/acme/stories/resolve/{one['code']}")
    ).json()["module_id"] is None  # dry run wrote nothing

    result = await _bulk(
        client,
        project,
        codes=[one["code"], two["code"], "MBA-9999", "OTHER-1", "nope"],
        module_id=module["id"],
    )
    assert result["counts"] == {"updated": 2, "unchanged": 0, "failed": 3}
    assert {f["error"] for f in result["failed"]} == {"not_found", "cross_project", "bad_code"}
    assert all(u["previous_module_id"] is None for u in result["updated"])
    assert result["correlation_id"]

    stored = (
        await client.get(f"/api/workspaces/acme/stories/resolve/{one['code']}")
    ).json()
    assert stored["module_id"] == module["id"]
    assert stored["priority"] == "high" and stored["title"] == one["title"]  # nothing else moved

    # idempotent: a repeat is a no-op reported as unchanged
    again = await _bulk(client, project, codes=[one["code"]], module_id=module["id"])
    assert again["counts"] == {"updated": 0, "unchanged": 1, "failed": 0}

    removed = await _bulk(client, project, codes=[one["code"]], module_id=None)
    assert removed["counts"]["updated"] == 1
    assert removed["updated"][0]["previous_module_id"] == module["id"]


async def test_bulk_assign_rejects_foreign_module(client):
    project = await setup_project(client)
    other = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Web", "identifier": "WEB", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    foreign = await _module(client, other, "Payments")
    story = await _story(client, project, "Card capture")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/modules/bulk-assign/",
        json={"codes": [story["code"]], "module_id": foreign["id"]},
    )
    assert res.status_code == 404


async def test_viewer_cannot_manage_modules(client):
    from tests.test_project_viewer_readonly import _sign_in, setup_project_with_alan

    project = await setup_project_with_alan(client, "viewer")
    module = await _module(client, project, "Payments")
    await _sign_in(client, "alan@example.test")
    base = f"/api/workspaces/acme/projects/{project['id']}/modules"
    assert (await client.post(f"{base}/", json={"name": "Nope"})).status_code == 403
    assert (await client.delete(f"{base}/{module['id']}/")).status_code == 403
    assert (
        await client.post(f"{base}/bulk-assign/", json={"codes": ["MBA-1"], "module_id": None})
    ).status_code == 403
