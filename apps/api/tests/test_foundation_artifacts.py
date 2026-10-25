async def _signup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"},
    )


async def _mk_ws(client, slug):
    await client.post("/api/workspaces/", json={"name": slug.title(), "slug": slug})


async def _mk_project(client, slug):
    res = await client.post(
        f"/api/workspaces/{slug}/projects/",
        json={"name": "Web", "identifier": "WEB", "flow": "fresh",
              "cover_image_url": "https://img.test/c.jpg"},
    )
    return res.json()


async def test_builtin_shelf_listed(client):
    await _signup(client)
    await _mk_ws(client, "acme")
    res = await client.get("/api/workspaces/acme/artifacts/")
    assert res.status_code == 200
    ids = {a["id"] for a in res.json()}
    assert "skill:emil-design-eng" in ids
    assert "design_system:shadcn" in ids
    assert "persona:architect" in ids


async def test_list_filtered_by_type(client):
    await _signup(client)
    await _mk_ws(client, "acme")
    res = await client.get("/api/workspaces/acme/artifacts/?artifact_type=persona")
    assert res.status_code == 200
    assert {a["artifact_type"] for a in res.json()} == {"persona"}


async def test_private_artifact_scoped_to_workspace(client):
    await _signup(client)
    await _mk_ws(client, "acme")
    await _mk_ws(client, "beta")
    created = await client.post(
        "/api/workspaces/acme/artifacts/",
        json={"artifact_type": "skill", "name": "acme-secret", "visibility": "private"},
    )
    assert created.status_code == 200
    art_id = created.json()["id"]
    acme = {a["id"] for a in (await client.get("/api/workspaces/acme/artifacts/")).json()}
    beta = {a["id"] for a in (await client.get("/api/workspaces/beta/artifacts/")).json()}
    assert art_id in acme
    assert art_id not in beta  # private stays in-workspace


async def test_public_artifact_visible_across_workspaces(client):
    await _signup(client)
    await _mk_ws(client, "acme")
    await _mk_ws(client, "beta")
    created = await client.post(
        "/api/workspaces/acme/artifacts/",
        json={"artifact_type": "design_system", "name": "acme-ds", "visibility": "public"},
    )
    art_id = created.json()["id"]
    beta = {a["id"] for a in (await client.get("/api/workspaces/beta/artifacts/")).json()}
    assert art_id in beta


async def test_pin_flow(client):
    await _signup(client)
    await _mk_ws(client, "acme")
    proj = await _mk_project(client, "acme")
    base = f"/api/workspaces/acme/projects/{proj['id']}/foundation"
    await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})
    put = await client.put(
        base + "/pins/",
        json={"pinned_artifacts": ["skill:emil-design-eng", "design_system:shadcn"]},
    )
    assert put.status_code == 200
    assert put.json()["pinned_artifacts"] == ["skill:emil-design-eng", "design_system:shadcn"]
    got = await client.get(base + "/pins/")
    assert "skill:emil-design-eng" in got.json()


async def test_pin_unknown_artifact_is_400(client):
    await _signup(client)
    await _mk_ws(client, "acme")
    proj = await _mk_project(client, "acme")
    base = f"/api/workspaces/acme/projects/{proj['id']}/foundation"
    await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})
    res = await client.put(base + "/pins/", json={"pinned_artifacts": ["skill:does-not-exist"]})
    assert res.status_code == 400


def test_domain_persona_roster_and_extraction():
    from gigsnano_api.features.foundation.artifacts import BUILTIN_ARTIFACTS, persona_domain

    assert persona_domain("gigs-finance-expert") == "finance"
    assert persona_domain("gigs-health-expert") == "health"
    assert persona_domain("Developer") is None

    domains = {
        persona_domain(a["name"])
        for a in BUILTIN_ARTIFACTS
        if a["artifact_type"] == "persona"
    }
    assert {"finance", "health", "ecommerce", "data"} <= domains
