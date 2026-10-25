"""GIN-413 — work-item Code scope endpoints."""


async def _setup(client, *, with_default_bundle=True):
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
        r = await client.post(
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
        repo = r.json()[0]["repository"]
        await client.patch(f"{base}/repositories/{repo['id']}/", json={"default_access": access})
        return repo

    web = await connect("acme/web", "write")
    api = await connect("acme/api", "reference")

    if with_default_bundle:
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
                        cfg(api["id"], "reference", "packages/api"),
                    ],
                    "dependencies": [],
                    "save_as_draft": False,
                },
            )
        ).json()
        await client.post(f"{base}/system-bundles/{bundle['id']}/default/")

    story = (await client.post(f"{base}/stories/", json={"title": "Task"})).json()
    return base, web, api, story["id"]


def _scope_url(base, sid):
    return f"{base}/stories/{sid}/code-scope/"


async def test_scope_derived_from_default_bundle(client):
    base, web, api, sid = await _setup(client)
    res = await client.get(_scope_url(base, sid))
    assert res.status_code == 200
    scope = res.json()
    assert scope["has_default_bundle"] is True
    assert scope["status"] == "draft" and scope["id"] is None  # unpersisted default
    modes = {r["project_repository_id"]: r["mode"] for r in scope["repositories"]}
    assert modes[web["id"]] == "write" and modes[api["id"]] == "reference"
    # Write repo carries required-delivery + display name from the bundle/repo.
    web_scope = next(r for r in scope["repositories"] if r["project_repository_id"] == web["id"])
    assert web_scope["required_delivery"] is True and web_scope["display_name"] == "web"


async def test_no_default_bundle_gives_empty_scope(client):
    base, _web, _api, sid = await _setup(client, with_default_bundle=False)
    scope = (await client.get(_scope_url(base, sid))).json()
    assert scope["has_default_bundle"] is False
    assert scope["repositories"] == []


async def test_save_confirm_and_effective(client):
    base, web, api, sid = await _setup(client)
    url = _scope_url(base, sid)

    # Effective is refused until confirmed.
    assert (await client.get(f"{url}effective/")).status_code == 409

    # Override: promote api Reference -> Write, exclude nothing.
    save = await client.put(
        url,
        json={
            "reason": "api change too",
            "repositories": [
                {
                    "project_repository_id": web["id"],
                    "mode": "write",
                    "required_delivery": True,
                    "base_branch": "main",
                },
                {
                    "project_repository_id": api["id"],
                    "mode": "write",
                    "required_delivery": True,
                    "base_branch": "main",
                },
            ],
        },
    )
    assert save.status_code == 200
    body = save.json()
    assert body["id"] is not None and body["status"] == "draft"
    assert {r["mode"] for r in body["repositories"]} == {"write"}

    confirmed = await client.post(f"{url}confirm/")
    assert confirmed.status_code == 200
    c = confirmed.json()
    assert c["status"] == "confirmed" and c["confirmed_at"] is not None

    eff = (await client.get(f"{url}effective/")).json()
    assert set(eff["write"]) == {web["id"], api["id"]}
    assert eff["reference"] == [] and eff["excluded"] == []


async def test_reset_returns_to_bundle_defaults(client):
    base, web, api, sid = await _setup(client)
    url = _scope_url(base, sid)
    await client.put(
        url,
        json={"repositories": [{"project_repository_id": web["id"], "mode": "excluded"}]},
    )
    saved = (await client.get(url)).json()
    assert saved["id"] is not None

    reset = (await client.post(f"{url}reset/")).json()
    assert reset["id"] is None  # back to unpersisted defaults
    modes = {r["project_repository_id"]: r["mode"] for r in reset["repositories"]}
    assert modes[web["id"]] == "write" and modes[api["id"]] == "reference"


async def test_editing_a_confirmed_scope_unconfirms_it(client):
    base, web, api, sid = await _setup(client)
    url = _scope_url(base, sid)
    await client.post(f"{url}confirm/")  # frictionless: confirm derived defaults directly
    assert (await client.get(url)).json()["status"] == "confirmed"

    await client.put(
        url, json={"repositories": [{"project_repository_id": web["id"], "mode": "reference"}]}
    )
    assert (await client.get(url)).json()["status"] == "draft"
