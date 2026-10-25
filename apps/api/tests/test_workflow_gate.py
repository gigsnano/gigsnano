"""GIN-220/224 — Agentic workflow gate: a persona-approved transition is blocked
on FAIL and allowed on PASS with the decision recorded; a human-role gate lets a
satisfying role through. FakeProvider scripts the verdicts so no key is needed.
"""

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.workflows.gate import _blocked


async def _project(client, slug="acme"):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": f"{slug}@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    p = (await client.post(f"/api/workspaces/{slug}/projects/",
                           json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                                 "cover_image_url": "https://img.test/c.jpg"})).json()
    return p["id"]


async def _story(client, pid, slug="acme"):
    return (await client.post(f"/api/workspaces/{slug}/projects/{pid}/stories/",
                              json={"title": "Ship checkout"})).json()["id"]


async def test_persona_gate_blocks_fail_allows_pass(app, client):
    pid = await _project(client)
    sid = await _story(client, pid)
    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}"

    # Ungated move to in_review (no rule yet).
    assert (await client.patch(f"{base}/", json={"status": "in_review"})).status_code == 200

    # Gate in_review → done behind the Test Engineer persona.
    rule = await client.post(f"/api/workspaces/acme/projects/{pid}/workflow-rules/",
                             json={"from_status": "in_review", "to_status": "done",
                                   "approver_kind": "persona", "approver_ref": "agent_qa",
                                   "on_concerns": "block"})
    assert rule.status_code == 201

    # FAIL verdict → blocked, story stays in_review.
    app.state.llm_provider = FakeProvider(extractions=[{"verdict": "fail", "rationale": "No tests"}])
    blocked = await client.patch(f"{base}/", json={"status": "done"})
    assert blocked.status_code == 409
    assert "blocked" in blocked.json()["detail"].lower()
    assert (await client.get(f"{base}/")).json()["status"] == "in_review"

    # PASS verdict → allowed.
    app.state.llm_provider = FakeProvider(extractions=[{"verdict": "pass", "rationale": "Ready"}])
    ok = await client.patch(f"{base}/", json={"status": "done"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "done"

    # Both decisions recorded (audit), newest first.
    decisions = (await client.get(f"{base}/gate-decisions/")).json()
    assert [d["verdict"] for d in decisions] == ["pass", "fail"]
    assert [d["allowed"] for d in decisions] == [True, False]
    assert decisions[1]["rationale"] == "No tests"


async def test_human_gate_allows_satisfying_role(app, client):
    pid = await _project(client, slug="beta")
    sid = await _story(client, pid, slug="beta")
    base = f"/api/workspaces/beta/projects/{pid}/stories/{sid}"

    # Any → in_review requires an admin; the signup user is the OWNER (rank ≥ admin).
    await client.post(f"/api/workspaces/beta/projects/{pid}/workflow-rules/",
                      json={"from_status": "", "to_status": "in_review",
                            "approver_kind": "human", "approver_ref": "admin"})
    ok = await client.patch(f"{base}/", json={"status": "in_review"})
    assert ok.status_code == 200
    decisions = (await client.get(f"{base}/gate-decisions/")).json()
    assert decisions[0]["verdict"] == "pass" and decisions[0]["approver_kind"] == "human"


def test_blocked_policy():
    assert _blocked("fail", "block") is True
    assert _blocked("fail", "allow") is True          # FAIL always blocks
    assert _blocked("concerns", "block") is True
    assert _blocked("concerns", "warn") is False       # concerns allowed under warn/allow
    assert _blocked("pass", "block") is False
