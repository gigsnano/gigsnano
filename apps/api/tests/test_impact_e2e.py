"""GIN-204 — E2E: grounded impact & estimate accuracy over HTTP.

Ties GIN-200 (impact) + GIN-201 (estimate, suggested deps) together against
seeded work items: a real relation shows up as a related item with the right
reason, risk/estimate are sane, and a description reference is inferred as a
one-click dependency suggestion.
"""


async def _setup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                  "cover_image_url": "https://img.test/c.jpg"},
        )
    ).json()
    return p["id"]


async def _story(client, pid, title, description=""):
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{pid}/stories/",
            json={"title": title, "description": description},
        )
    ).json()


async def test_impact_and_estimate_accuracy_e2e(app, client):
    # Codes are derived from responses (the project seeds Sprint-0 stories, so the
    # new stories' numbers are offset) — asserting on real codes, not fabricated.
    pid = await _setup(client)
    base = f"/api/workspaces/acme/projects/{pid}/stories"

    a = await _story(client, pid, "Story A")
    b = await _story(client, pid, "Story B")
    b_code = b["code"]
    d = await _story(client, pid, "Story D", f"depends on {b_code} for the API")

    # A blocks B -> a real relation edge.
    rel = await client.post(
        f"{base}/{a['id']}/relations/",
        json={"related_story_id": b["id"], "relation_type": "blocking"},
    )
    assert rel.status_code == 201

    # Impact on A reflects the relation accurately, with no fabricated noise.
    impact = (await client.get(f"{base}/{a['id']}/impact/")).json()
    related = {r["code"]: r["reason"] for r in impact["related_items"]}
    assert related == {b_code: "blocking"}
    assert impact["risk"]["level"] == "low"  # one related item, no clone
    assert {"type": "item", "ref": b_code} in impact["citations"]

    # Estimate is grounded + sane.
    est = (await client.get(f"{base}/{a['id']}/estimate/")).json()
    assert est["story_code"] == a["code"]
    assert est["points"] >= 1
    assert "related item" in est["rationale"]

    # A description reference on D is inferred as a dependency suggestion.
    sugg = (await client.get(f"{base}/{d['id']}/suggested-dependencies/")).json()
    by_code = {s["code"]: s for s in sugg}
    assert b_code in by_code
    assert by_code[b_code]["evidence"] == "referenced in description"

    # A already links B, so B is NOT re-suggested for A.
    sugg_a = (await client.get(f"{base}/{a['id']}/suggested-dependencies/")).json()
    assert b_code not in {s["code"] for s in sugg_a}
