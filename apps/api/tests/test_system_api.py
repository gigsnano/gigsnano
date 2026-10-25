"""GIN-410/412 — repository + System Bundle API endpoints."""


async def setup_project(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={
                "name": "Mobile App",
                "identifier": "MBA",
                "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            },
        )
    ).json()
    return project["id"]


def _base(pid: str) -> str:
    return f"/api/workspaces/acme/projects/{pid}"


async def _connect(client, pid, full_name, repo_type="service"):
    res = await client.post(
        f"{_base(pid)}/repositories/",
        json={
            "repositories": [
                {
                    "external_repository_id": full_name,
                    "full_name": full_name,
                    "default_branch": "main",
                    "repository_type": repo_type,
                }
            ]
        },
    )
    assert res.status_code == 200, res.text
    return res.json()[0]


async def test_connect_lists_and_dedupes_repositories(client):
    pid = await setup_project(client)
    assert (await client.get(f"{_base(pid)}/repositories/")).json() == []

    r1 = await _connect(client, pid, "acme/web", "application")
    assert r1["ok"] and r1["repository"]["repository_type"] == "application"
    assert r1["repository"]["health"] == "syncing"  # pending clone/sync/index
    await _connect(client, pid, "acme/api", "service")

    repos = (await client.get(f"{_base(pid)}/repositories/")).json()
    assert {r["full_name"] for r in repos} == {"acme/web", "acme/api"}

    # Re-connecting an existing repo is reported ok+unchanged, not duplicated.
    again = await _connect(client, pid, "acme/web")
    assert again["ok"]
    assert len((await client.get(f"{_base(pid)}/repositories/")).json()) == 2


async def test_update_primary_refresh_and_disconnect(client):
    pid = await setup_project(client)
    web = (await _connect(client, pid, "acme/web"))["repository"]
    api = (await _connect(client, pid, "acme/api"))["repository"]

    # Make web primary.
    res = await client.patch(
        f"{_base(pid)}/repositories/{web['id']}/",
        json={"is_primary": True, "default_access": "write"},
    )
    assert res.status_code == 200 and res.json()["is_primary"] is True

    # Making api primary demotes web (one active primary per project).
    await client.patch(f"{_base(pid)}/repositories/{api['id']}/", json={"is_primary": True})
    repos = {r["id"]: r for r in (await client.get(f"{_base(pid)}/repositories/")).json()}
    assert repos[api["id"]]["is_primary"] and not repos[web["id"]]["is_primary"]

    # Refresh flips health to ready.
    refreshed = await client.post(f"{_base(pid)}/repositories/{web['id']}/refresh/")
    assert refreshed.json()["health"] == "ready"

    # Disconnect removes it from the active list.
    assert (await client.delete(f"{_base(pid)}/repositories/{web['id']}/")).json() == {
        "success": True
    }
    remaining = (await client.get(f"{_base(pid)}/repositories/")).json()
    assert [r["id"] for r in remaining] == [api["id"]]
    assert (await client.delete(f"{_base(pid)}/repositories/nope/")).status_code == 404


def _cfg(repo_id, mount, access="write"):
    return {
        "project_repository_id": repo_id,
        "repository_type": "service",
        "branch": "main",
        "source_path": "",
        "mount_path": mount,
        "access": access,
        "required": True,
        "build_command": "",
        "test_command": "",
        "execution_order": 0,
    }


async def test_bundle_create_validate_default_and_archive(client):
    pid = await setup_project(client)
    web = (await _connect(client, pid, "acme/web"))["repository"]
    api = (await _connect(client, pid, "acme/api"))["repository"]

    # Validate endpoint (no save).
    v = await client.post(
        f"{_base(pid)}/system-bundles/validate/",
        json={
            "repositories": [_cfg(web["id"], "apps/web"), _cfg(api["id"], "services/api")],
            "dependencies": [],
        },
    )
    assert v.status_code == 200 and v.json()["valid"] is True

    # Create a valid bundle.
    res = await client.post(
        f"{_base(pid)}/system-bundles/",
        json={
            "name": "Platform",
            "description": "web + api",
            "repositories": [_cfg(web["id"], "apps/web"), _cfg(api["id"], "services/api")],
            "dependencies": [],
            "save_as_draft": False,
        },
    )
    assert res.status_code == 200, res.text
    bundle = res.json()
    assert bundle["status"] == "valid"
    assert bundle["repository_count"] == 2 and bundle["write_count"] == 2
    assert bundle["latest"]["version"] == 1
    assert bundle["latest"]["validation_result"]["valid"] is True

    # Set default → repo now reports the bundle membership.
    d = await client.post(f"{_base(pid)}/system-bundles/{bundle['id']}/default/")
    assert d.status_code == 200 and d.json()["is_default"] is True
    repos = {r["id"]: r for r in (await client.get(f"{_base(pid)}/repositories/")).json()}
    assert bundle["id"] in repos[web["id"]]["bundle_ids"]

    # An invalid bundle (duplicate mount path) cannot be default.
    bad = (
        await client.post(
            f"{_base(pid)}/system-bundles/",
            json={
                "name": "Broken",
                "repositories": [_cfg(web["id"], "same"), _cfg(api["id"], "same")],
                "dependencies": [],
                "save_as_draft": False,
            },
        )
    ).json()
    assert bad["status"] == "invalid"
    conflict = await client.post(f"{_base(pid)}/system-bundles/{bad['id']}/default/")
    assert conflict.status_code == 409

    # Archive removes it from the list.
    assert (await client.delete(f"{_base(pid)}/system-bundles/{bad['id']}/")).json() == {
        "success": True
    }
    names = {b["name"] for b in (await client.get(f"{_base(pid)}/system-bundles/")).json()}
    assert names == {"Platform"}


async def test_bundle_edit_mints_new_version(client):
    pid = await setup_project(client)
    web = (await _connect(client, pid, "acme/web"))["repository"]
    bundle = (
        await client.post(
            f"{_base(pid)}/system-bundles/",
            json={
                "name": "B",
                "repositories": [_cfg(web["id"], "apps/web")],
                "dependencies": [],
                "save_as_draft": False,
            },
        )
    ).json()
    assert bundle["current_version"] == 1

    edited = await client.patch(
        f"{_base(pid)}/system-bundles/{bundle['id']}/",
        json={"repositories": [_cfg(web["id"], "apps/site")], "save_as_draft": False},
    )
    body = edited.json()
    assert body["current_version"] == 2
    assert body["latest"]["repositories"][0]["mount_path"] == "apps/site"


async def test_endpoints_require_auth(client):
    # No workspace/project for an anonymous caller → not 200.
    res = await client.get("/api/workspaces/acme/projects/nope/repositories/")
    assert res.status_code in (401, 404)
