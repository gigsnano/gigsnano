"""Workspace holiday calendar — the non-working days charts exclude."""


async def setup(client):
    """Ada owns 'acme'. Returns nothing; Ada stays signed in."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_new_workspace_has_an_empty_calendar(client):
    await setup(client)
    res = await client.get("/api/workspaces/acme/")
    assert res.status_code == 200
    assert res.json()["holidays"] == []


async def test_admin_sets_holidays(client):
    await setup(client)
    res = await client.patch("/api/workspaces/acme/", json={
        "holidays": [
            {"date": "2026-12-25", "name": "Christmas"},
            {"date": "2026-01-01", "name": "New Year"},
        ]
    })
    assert res.status_code == 200
    # Sorted on the way in, so no reader has to re-sort a list the writer could
    # have ordered once.
    assert res.json()["holidays"] == [
        {"date": "2026-01-01", "name": "New Year"},
        {"date": "2026-12-25", "name": "Christmas"},
    ]


async def test_one_entry_per_date(client):
    await setup(client)
    res = await client.patch("/api/workspaces/acme/", json={
        "holidays": [
            {"date": "2026-01-01", "name": "New Year"},
            {"date": "2026-01-01", "name": "New Year's Day"},
        ]
    })
    assert res.status_code == 200
    # A duplicate would double-count against anything building a set from these.
    assert len(res.json()["holidays"]) == 1


async def test_holidays_survive_a_name_only_update(client):
    """Both fields are optional; omitting one must not clear it."""
    await setup(client)
    await client.patch("/api/workspaces/acme/", json={
        "holidays": [{"date": "2026-01-01", "name": "New Year"}]
    })
    res = await client.patch("/api/workspaces/acme/", json={"name": "Acme Corp"})
    assert res.status_code == 200
    assert res.json()["name"] == "Acme Corp"
    assert len(res.json()["holidays"]) == 1


async def test_name_survives_a_holidays_only_update(client):
    await setup(client)
    res = await client.patch("/api/workspaces/acme/", json={"holidays": []})
    assert res.status_code == 200
    assert res.json()["name"] == "Acme"


async def test_calendar_is_capped(client):
    await setup(client)
    res = await client.patch("/api/workspaces/acme/", json={
        "holidays": [
            {"date": f"20{26 + i // 300:02d}-01-01", "name": f"H{i}"} for i in range(201)
        ]
    })
    assert res.status_code == 422


async def test_a_plain_member_cannot_change_the_calendar(client):
    """The calendar drives every chart in the workspace — not a member's call."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/auth/sign-out/")
    await setup(client)
    alan = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    await client.patch(f"/api/workspaces/acme/members/{alan['id']}/", json={"accept": True})

    res = await client.patch("/api/workspaces/acme/", json={
        "holidays": [{"date": "2026-01-01", "name": "New Year"}]
    })
    assert res.status_code == 403
