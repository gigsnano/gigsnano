"""GIN-414 — Delivery Bundle state machine + endpoints."""

from gigsnano_api.features.system import delivery_state as ds


def _repo(
    rid="a",
    *,
    required=True,
    no_change=False,
    ci="none",
    review="none",
    merge="pending",
    pr="",
    head="",
    commit=0,
):
    return {
        "project_repository_id": rid,
        "required": required,
        "no_change": no_change,
        "ci_state": ci,
        "review_state": review,
        "merge_state": merge,
        "pr_url": pr,
        "head_branch": head,
        "commit_count": commit,
    }


# --- Pure state machine -----------------------------------------------------


def test_states_progress_deterministically():
    assert ds.compute_overall_state([]) == ds.SCOPE_PROPOSED
    assert ds.compute_overall_state([_repo(commit=1)]) == ds.IN_DEVELOPMENT
    ready = _repo(pr="http://pr", ci="passed", review="approved", merge="ready")
    assert ds.compute_overall_state([ready]) == ds.READY_TO_MERGE
    assert ds.compute_overall_state([ready, _repo("b", head="feature/x")]) == ds.PARTIALLY_READY
    assert ds.compute_overall_state([_repo(merge="merged")]) == ds.RELEASED
    assert (
        ds.compute_overall_state([_repo("a", merge="merged"), _repo("b", head="x")])
        == ds.PARTIALLY_MERGED
    )


def test_cancelled_and_rollback_win():
    assert ds.compute_overall_state([_repo(merge="merged")], cancelled=True) == ds.CANCELLED
    assert (
        ds.compute_overall_state([_repo(merge="merged")], rollback_required=True)
        == ds.ROLLBACK_REQUIRED
    )


def test_no_change_and_reference_do_not_gate():
    # A required no-change repo doesn't block; released once real work merged.
    repos = [_repo("a", merge="merged"), _repo("b", no_change=True)]
    assert ds.compute_overall_state(repos) == ds.RELEASED
    # Reference (not required) never blocks Done.
    assert ds.blocking_repos([_repo("a", required=False, head="x")]) == []


def test_blocking_repos_lists_unmerged_required():
    repos = [_repo("a", merge="merged"), _repo("b", head="x"), _repo("c", no_change=True)]
    assert ds.blocking_repos(repos) == ["b"]


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
    sid = (await client.post(f"{base}/stories/", json={"title": "Add email verification"})).json()[
        "id"
    ]
    return base, web, api, sid


async def test_delivery_requires_confirmed_scope(client):
    base, _web, _api, sid = await _setup(client)
    # No confirmed code scope yet → create is refused (409).
    assert (await client.post(f"{base}/stories/{sid}/delivery/")).status_code == 409


async def test_create_and_progress_delivery(client):
    base, web, _api, sid = await _setup(client)
    await client.post(f"{base}/stories/{sid}/code-scope/confirm/")  # confirm derived defaults

    created = await client.post(f"{base}/stories/{sid}/delivery/")
    assert created.status_code == 200, created.text
    d = created.json()
    assert d["overall_state"] == "scope_proposed"
    # Only the Write repo gets a delivery row; branch name generated from the pattern.
    assert [r["project_repository_id"] for r in d["repositories"]] == [web["id"]]
    assert d["branch_name"].startswith("feature/APP-")
    assert d["blocking_repo_ids"] == [web["id"]]

    # Drive the Write repo to ready → overall Ready to merge.
    ready = await client.patch(
        f"{base}/stories/{sid}/delivery/repositories/{web['id']}/",
        json={
            "pr_url": "http://pr/1",
            "ci_state": "passed",
            "review_state": "approved",
            "merge_state": "ready",
            "head_branch": "feature/APP-1",
        },
    )
    assert ready.json()["overall_state"] == "ready_to_merge"

    # Merge it → Released, nothing blocks Done.
    merged = await client.patch(
        f"{base}/stories/{sid}/delivery/repositories/{web['id']}/", json={"merge_state": "merged"}
    )
    body = merged.json()
    assert body["overall_state"] == "released" and body["blocking_repo_ids"] == []

    # Idempotent: re-create returns the same bundle.
    again = await client.post(f"{base}/stories/{sid}/delivery/")
    assert again.json()["id"] == d["id"]


async def test_cancel_delivery(client):
    base, _web, _api, sid = await _setup(client)
    await client.post(f"{base}/stories/{sid}/code-scope/confirm/")
    await client.post(f"{base}/stories/{sid}/delivery/")
    cancelled = await client.post(f"{base}/stories/{sid}/delivery/cancel/")
    assert cancelled.json()["overall_state"] == "cancelled"
    assert cancelled.json()["blocking_repo_ids"] == []
