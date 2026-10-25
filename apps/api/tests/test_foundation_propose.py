"""GIN-196 — propose-change -> review -> approve/reject (versioned) + history."""


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


async def test_propose_approve_reject_and_history(client):
    base = await _project(client)

    # Lock v1.
    locked = await client.post(base + "/lock/", json={"preset_key": "next-shadcn"})
    assert locked.json()["version"] == 1
    assert locked.json()["history"] == []
    assert locked.json()["pending_change"] is None

    # Propose a change — recorded, NOT applied.
    prop = await client.post(base + "/propose/", json={"preset_key": "react-vite-tailwind"})
    assert prop.status_code == 200
    assert prop.json()["version"] == 1  # still v1
    assert prop.json()["preset_key"] == "next-shadcn"  # unchanged
    assert prop.json()["pending_change"]["payload"]["preset_key"] == "react-vite-tailwind"
    assert prop.json()["pending_change"]["proposed_by"]  # who

    # Reject — pending cleared, lock unchanged.
    rej = await client.post(base + "/propose/reject/")
    assert rej.json()["pending_change"] is None
    assert rej.json()["version"] == 1

    # Propose again then approve — becomes the enforced v2; v1 snapshotted in history.
    await client.post(base + "/propose/", json={"preset_key": "react-vite-tailwind"})
    appr = await client.post(base + "/propose/approve/")
    assert appr.json()["version"] == 2
    assert appr.json()["preset_key"] == "react-vite-tailwind"
    assert appr.json()["pending_change"] is None
    assert [h["version"] for h in appr.json()["history"]] == [1]

    # Downstream enforcement uses the new lock immediately: `next` is now unapproved.
    bad = await client.post(
        base + "/validate/",
        json={"diff": "--- a/p.tsx\n+++ b/p.tsx\n@@ -1,0 +1,1 @@\n+import Link from 'next/link'\n",
              "gate_results": {"react-doctor": True}},
    )
    assert bad.json()["status"] == "fail"

    # An incompatible proposed stack is rejected up front (never becomes pending).
    incompatible = await client.post(
        base + "/propose/",
        json={"allowed_libraries": ["react"], "database": "postgres", "architecture": "graph"},
    )
    assert incompatible.status_code == 400
    # Nothing pending got stored.
    cur = await client.get(base + "/")
    assert cur.json()["pending_change"] is None

    # Approve with nothing pending -> 400.
    empty = await client.post(base + "/propose/approve/")
    assert empty.status_code == 400
