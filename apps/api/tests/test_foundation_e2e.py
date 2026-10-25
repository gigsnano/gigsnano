"""GIN-198 — end-to-end: the Foundation is enforced, not hoped.

Covers the enforceable surface that exists today: lock (greenfield + a
brownfield-style custom lock), pin artifacts, a violating deliverable blocked
with specific violations, a compliant one passing, and re-lock versioning that
downstream validation immediately respects.

Out of scope (blocked on GIN-197): "pinned skills demonstrably shape an agent
run" — there is no agent-run/gig surface that emits a code diff to enforce yet.
"""

VIOLATING_DIFF = (
    "--- a/Button.tsx\n+++ b/Button.tsx\n@@ -1,1 +1,3 @@\n"
    " const x = 1\n+const c = '#ff0000'\n+import moment from 'moment'\n"
)
COMPLIANT_DIFF = "--- a/Ok.tsx\n+++ b/Ok.tsx\n@@ -1,0 +1,1 @@\n+import { useState } from 'react'\n"
NEXT_IMPORT_DIFF = "--- a/p.tsx\n+++ b/p.tsx\n@@ -1,0 +1,1 @@\n+import Link from 'next/link'\n"


async def _project(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post(
        "/api/workspaces/acme/projects/",
        json={"name": "Web", "identifier": "WEB", "flow": "fresh",
              "cover_image_url": "https://img.test/c.jpg"},
    )
    return f"/api/workspaces/acme/projects/{res.json()['id']}/foundation"


async def test_foundation_enforcement_e2e(client):
    base = await _project(client)

    # 1. Greenfield lock.
    locked = await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})
    assert locked.status_code == 200
    assert locked.json()["version"] == 1

    # Load a pinned skill into the Foundation.
    pins = await client.put(base + "/pins/", json={"pinned_artifacts": ["skill:emil-design-eng"]})
    assert pins.status_code == 200
    assert pins.json()["pinned_artifacts"] == ["skill:emil-design-eng"]

    # 2. A violating deliverable is blocked with specific violations...
    bad = await client.post(
        base + "/validate/", json={"diff": VIOLATING_DIFF, "gate_results": {"react-doctor": True}}
    )
    assert bad.json()["status"] == "fail"
    rules = {v["rule"] for v in bad.json()["violations"]}
    assert {"no-hardcoded-color", "unapproved-library"} <= rules

    # ...a failing quality gate is caught...
    gate = await client.post(
        base + "/validate/", json={"diff": COMPLIANT_DIFF, "gate_results": {"react-doctor": False}}
    )
    assert gate.json()["status"] == "fail"
    assert any(v["rule"] == "quality-gate" for v in gate.json()["violations"])

    # ...and a compliant deliverable with a passing gate flows.
    ok = await client.post(
        base + "/validate/", json={"diff": COMPLIANT_DIFF, "gate_results": {"react-doctor": True}}
    )
    assert ok.json()["status"] == "pass"

    # 3. Re-lock (change the stack) bumps the version and downstream validation
    # immediately enforces the new allow-list: `next` is now unapproved.
    relock = await client.post(base + "/lock/", json={"preset_key": "react-vite-tailwind"})
    assert relock.json()["version"] == 2
    now_bad = await client.post(
        base + "/validate/", json={"diff": NEXT_IMPORT_DIFF, "gate_results": {"react-doctor": True}}
    )
    assert now_bad.json()["status"] == "fail"
    assert any(v["rule"] == "unapproved-library" for v in now_bad.json()["violations"])

    # An incompatible composed stack never locks.
    bad_lock = await client.post(
        base + "/lock/",
        json={"allowed_libraries": ["react"], "database": "postgres", "architecture": "graph"},
    )
    assert bad_lock.status_code == 400
