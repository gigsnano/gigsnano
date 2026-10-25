async def _setup_project(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post(
        "/api/workspaces/acme/projects/",
        json={
            "name": "Web",
            "identifier": "WEB",
            "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        },
    )
    return res.json()


async def test_lock_then_read_foundation(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"

    locked = await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})
    assert locked.status_code == 200
    body = locked.json()
    assert body["status"] == "locked"
    assert body["enforce_design_tokens"] is True
    assert "react" in body["allowed_libraries"]

    read = await client.get(base + "/")
    assert read.status_code == 200
    assert read.json()["preset_key"] == "next-shadcn"


async def test_lock_unknown_preset_is_400(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    res = await client.post(base + "/lock/", json={"preset_key": "nope"})
    assert res.status_code == 400


async def test_lock_custom_stack(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"

    locked = await client.post(
        base + "/lock/",
        json={"allowed_libraries": ["react", "svelte"], "quality_gates": ["ci"]},
    )
    assert locked.status_code == 200
    body = locked.json()
    assert body["preset_key"] == "custom"
    assert body["allowed_libraries"] == ["react", "svelte"]
    assert body["quality_gates"] == ["ci"]
    assert body["enforce_design_tokens"] is False


async def test_lock_custom_with_database_and_architecture(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    locked = await client.post(
        base + "/lock/",
        json={
            "allowed_libraries": ["react", "next"],
            "database": "postgres",
            "architecture": "normalized",
        },
    )
    assert locked.status_code == 200
    body = locked.json()
    assert body["database"] == "postgres"
    assert body["architecture"] == "normalized"


async def test_lock_incompatible_stack_is_400(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    res = await client.post(
        base + "/lock/",
        json={"allowed_libraries": ["react"], "database": "postgres", "architecture": "graph"},
    )
    assert res.status_code == 400
    assert "does not fit" in res.json()["detail"]


async def test_lock_with_neither_preset_nor_custom_is_400(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    res = await client.post(base + "/lock/", json={})
    assert res.status_code == 400


async def test_validate_flags_hardcoded_color_and_bad_lib(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})

    diff = (
        "--- a/Button.tsx\n+++ b/Button.tsx\n"
        "@@ -1,1 +1,3 @@\n"
        " const x = 1\n"
        "+const c = '#ff0000'\n"
        "+import moment from 'moment'\n"
    )
    res = await client.post(base + "/validate/", json={"diff": diff, "gate_results": {"react-doctor": True}})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "fail"
    rules_hit = {v["rule"] for v in body["violations"]}
    assert "no-hardcoded-color" in rules_hit
    assert "unapproved-library" in rules_hit


async def test_validate_compliant_diff_passes(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})
    diff = "--- a/Ok.tsx\n+++ b/Ok.tsx\n@@ -1,0 +1,1 @@\n+import { useState } from 'react'\n"
    res = await client.post(base + "/validate/", json={"diff": diff, "gate_results": {"react-doctor": True}})
    assert res.json()["status"] == "pass"


async def test_validate_without_locked_foundation_is_404(client):
    project = await _setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/foundation"
    res = await client.post(base + "/validate/", json={"diff": "", "gate_results": {}})
    assert res.status_code == 404
