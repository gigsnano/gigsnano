"""GIN-416 — audit trail + health rollup."""

from gigsnano_api.features.system import health


# --- Pure health rollup -----------------------------------------------------


def test_repo_health_rollup():
    assert health.repo_health_rollup("ready", "ready", "ready") == health.HEALTHY
    assert health.repo_health_rollup("failed", "none", "none") == health.BLOCKED
    assert health.repo_health_rollup("pending", "none", "none") == health.DEGRADED
    assert health.repo_health_rollup("ready", "none", "pending") == health.DEGRADED
    assert health.repo_health_rollup("none", "none", "none") == health.UNKNOWN


def test_bundle_health_required_vs_optional():
    healthy = {"rollup": health.HEALTHY, "required": True}
    assert health.bundle_health([healthy]) == health.HEALTHY
    # A required blocked repo blocks the bundle.
    assert health.bundle_health([{"rollup": health.BLOCKED, "required": True}]) == health.BLOCKED
    # An optional blocked repo only degrades.
    assert (
        health.bundle_health([healthy, {"rollup": health.BLOCKED, "required": False}])
        == health.DEGRADED
    )
    assert health.bundle_health([]) == health.UNKNOWN


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
    repo = (
        await client.post(
            f"{base}/repositories/",
            json={
                "repositories": [
                    {
                        "external_repository_id": "acme/web",
                        "full_name": "acme/web",
                        "default_branch": "main",
                    }
                ]
            },
        )
    ).json()[0]["repository"]
    await client.patch(f"{base}/repositories/{repo['id']}/", json={"default_access": "write"})
    cfg = {
        "project_repository_id": repo["id"],
        "repository_type": "service",
        "branch": "main",
        "source_path": "",
        "mount_path": "apps/web",
        "access": "write",
        "required": True,
        "build_command": "",
        "test_command": "",
        "execution_order": 0,
    }
    bundle = (
        await client.post(
            f"{base}/system-bundles/",
            json={
                "name": "Default",
                "repositories": [cfg],
                "dependencies": [],
                "save_as_draft": False,
            },
        )
    ).json()
    await client.post(f"{base}/system-bundles/{bundle['id']}/default/")
    return base, repo, bundle


async def test_mutations_write_audit_events(client):
    base, repo, bundle = await _setup(client)
    events = (await client.get(f"{base}/system-audit/")).json()
    actions = {e["action"] for e in events}
    assert {
        "repository.connect",
        "repository.update",
        "bundle.create",
        "bundle.set_default",
    } <= actions
    # No secrets / URLs in the audit summaries (we store summaries only).
    for e in events:
        assert "https://" not in (e["after_summary"] + e["before_summary"])
    # Setting Primary is recorded distinctly.
    await client.patch(f"{base}/repositories/{repo['id']}/", json={"is_primary": True})
    actions2 = {e["action"] for e in (await client.get(f"{base}/system-audit/")).json()}
    assert "repository.set_primary" in actions2


async def test_codebase_health_rollup(client):
    base, repo, bundle = await _setup(client)
    h = (await client.get(f"{base}/codebase/health/")).json()
    # Freshly-connected repo is still cloning → degraded; required-degraded bundle → degraded.
    repo_health = next(r for r in h["repositories"] if r["project_repository_id"] == repo["id"])
    assert repo_health["rollup"] in ("degraded", "unknown")
    assert h["bundles"][0]["rollup"] in ("degraded", "unknown")

    # Refresh the repo → healthy → bundle healthy.
    await client.post(f"{base}/repositories/{repo['id']}/refresh/")
    h2 = (await client.get(f"{base}/codebase/health/")).json()
    assert (
        next(r for r in h2["repositories"] if r["project_repository_id"] == repo["id"])["rollup"]
        == "healthy"
    )
    assert h2["bundles"][0]["rollup"] == "healthy"
