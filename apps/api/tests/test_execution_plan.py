"""GIN-415 — scoped execution plan + Source Snapshot."""

from gigsnano_api.features.system import execution_plan as ep
from gigsnano_api.features.system.schemas import ExecutionPlanOut


def _plan(**over):
    base = dict(
        work_item_id="s1",
        bundle_version_id="v1",
        branch_pattern="feature/{code}",
        stale=False,
        can_start=True,
        repositories=[],
        write_ids=["a"],
        reference_ids=["b"],
        excluded_ids=["c"],
        warnings=[],
    )
    base.update(over)
    return ExecutionPlanOut(**base)


# --- Pure boundary predicates -----------------------------------------------


def test_boundary_predicates():
    plan = _plan()
    assert ep.can_write(plan, "a") and not ep.can_write(plan, "b") and not ep.can_write(plan, "c")
    assert ep.can_read(plan, "a") and ep.can_read(plan, "b")
    assert not ep.can_read(plan, "c")  # excluded is never readable


# --- Endpoints --------------------------------------------------------------


async def _setup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    pid = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "App", "identifier": "APP", "flow": "fresh", "cover_image_url": "x"},
        )
    ).json()["id"]
    base = f"/api/workspaces/acme/projects/{pid}"

    async def connect(full_name, access):
        repo = (
            await client.post(
                f"{base}/repositories/",
                json={
                    "repositories": [
                        {
                            "external_repository_id": full_name,
                            "full_name": full_name,
                            "default_branch": "main",
                        }
                    ]
                },
            )
        ).json()[0]["repository"]
        await client.patch(f"{base}/repositories/{repo['id']}/", json={"default_access": access})
        return repo

    web = await connect("acme/web", "write")
    api = await connect("acme/api", "reference")
    cfg = lambda rid, access, mount: {  # noqa: E731
        "project_repository_id": rid,
        "repository_type": "service",
        "branch": "main",
        "source_path": "",
        "mount_path": mount,
        "access": access,
        "required": access == "write",
        "build_command": "",
        "test_command": "",
        "execution_order": 0,
    }
    bundle = (
        await client.post(
            f"{base}/system-bundles/",
            json={
                "name": "Default",
                "repositories": [
                    cfg(web["id"], "write", "apps/web"),
                    cfg(api["id"], "reference", "pkg/api"),
                ],
                "dependencies": [],
                "save_as_draft": False,
            },
        )
    ).json()
    await client.post(f"{base}/system-bundles/{bundle['id']}/default/")
    sid = (await client.post(f"{base}/stories/", json={"title": "Task"})).json()["id"]
    return base, web, api, sid


async def test_execution_plan_requires_confirmed_scope(client):
    base, _web, _api, sid = await _setup(client)
    assert (await client.get(f"{base}/stories/{sid}/execution-plan/")).status_code == 409


async def test_execution_plan_and_source_snapshot(client):
    base, web, api, sid = await _setup(client)
    await client.post(f"{base}/stories/{sid}/code-scope/confirm/")

    plan = (await client.get(f"{base}/stories/{sid}/execution-plan/")).json()
    assert set(plan["write_ids"]) == {web["id"]} and set(plan["reference_ids"]) == {api["id"]}
    modes = {r["project_repository_id"]: r["mode"] for r in plan["repositories"]}
    assert modes[web["id"]] == "write" and modes[api["id"]] == "reference"
    web_repo = next(r for r in plan["repositories"] if r["project_repository_id"] == web["id"])
    assert web_repo["mount_path"] == "apps/web"
    # Write repo clone is pending after connect → required repo unavailable → can't start.
    assert plan["can_start"] is False

    # Refresh the Write repo → clone ready → run can start.
    await client.post(f"{base}/repositories/{web['id']}/refresh/")
    plan2 = (await client.get(f"{base}/stories/{sid}/execution-plan/")).json()
    assert plan2["can_start"] is True

    # Source Snapshot records Write + Reference (never Excluded).
    snap = (await client.post(f"{base}/stories/{sid}/source-snapshot/")).json()
    assert set(snap["repository_commits"].keys()) == {web["id"], api["id"]}
    assert snap["repository_commits"][web["id"]]["mode"] == "write"
    latest = (await client.get(f"{base}/stories/{sid}/source-snapshot/")).json()
    assert latest["id"] == snap["id"]


async def test_excluded_repo_drops_from_plan_and_snapshot(client):
    base, web, api, sid = await _setup(client)
    # Exclude the reference repo, keep web write.
    await client.put(
        f"{base}/stories/{sid}/code-scope/",
        json={
            "repositories": [
                {
                    "project_repository_id": web["id"],
                    "mode": "write",
                    "required_delivery": True,
                    "base_branch": "main",
                },
                {"project_repository_id": api["id"], "mode": "excluded"},
            ]
        },
    )
    await client.post(f"{base}/stories/{sid}/code-scope/confirm/")

    plan = (await client.get(f"{base}/stories/{sid}/execution-plan/")).json()
    assert set(plan["excluded_ids"]) == {api["id"]}
    snap = (await client.post(f"{base}/stories/{sid}/source-snapshot/")).json()
    assert api["id"] not in snap["repository_commits"]  # excluded is never snapshotted
    assert web["id"] in snap["repository_commits"]
