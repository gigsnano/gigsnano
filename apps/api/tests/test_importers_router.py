from gigsnano_api.features.importers.router import run_import_in_fresh_session

CLEAN_CSV = (
    "project_identifier,project_name,identifier,name,state_name,priority\n"
    "WEB,Website,WEB-1,Fix login bug,Todo,high\n"
)


async def sign_up(client, email: str, name: str):
    res = await client.post(
        "/api/auth/sign-up/",
        json={"display_name": name, "email": email, "password": "s3cret!"},
    )
    assert res.status_code == 201
    return res.json()


async def setup_admin_workspace(client):
    """Ada owns 'acme' (admin). Leaves Ada signed in."""
    await sign_up(client, "ada@example.test", "Ada Lovelace")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def add_member_and_sign_in(client) -> dict:
    """Adds Alan as a plain member of 'acme' and signs in as Alan."""
    alan = await sign_up(client, "alan@example.test", "Alan Turing")
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"})
    return alan


BASE = "/api/workspaces/acme/imports/"


async def test_upload_returns_queued_job(client):
    await setup_admin_workspace(client)
    res = await client.post(
        BASE,
        data={"format": "csv"},
        files={"file": ("plane_export.csv", CLEAN_CSV.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 201
    job = res.json()
    assert job["status"] == "queued"
    assert job["source_format"] == "csv"
    assert job["workspace_slug"] == "acme"


async def test_running_the_background_task_completes_the_job(client, db_engine):
    # httpx's ASGITransport awaits the full ASGI app call — including its
    # BackgroundTasks — before `.post()` returns, so the response body already
    # reflects the QUEUED job while the DB row gets updated in the same await.
    # Call the fresh-session wrapper directly too (the exact function
    # `background_tasks.add_task` schedules) so it's covered as a unit, and
    # confirm re-running it is a no-op idempotent rerun (not a duplicate import).
    await setup_admin_workspace(client)
    res = await client.post(
        BASE,
        data={"format": "csv"},
        files={"file": ("plane_export.csv", CLEAN_CSV.encode("utf-8"), "text/csv")},
    )
    job = res.json()
    assert job["status"] == "queued"

    got = (await client.get(f"{BASE}{job['id']}/")).json()
    assert got["status"] == "completed"
    assert got["summary"]["stories_created"] == 1
    assert got["summary"]["projects_created"] == 1

    await run_import_in_fresh_session(db_engine, job["id"])
    rerun = (await client.get(f"{BASE}{job['id']}/")).json()
    assert rerun["status"] == "completed"
    assert rerun["summary"]["stories_created"] == 0
    assert rerun["summary"]["stories_updated"] == 1


async def test_non_admin_gets_403_on_create_and_list(client):
    await setup_admin_workspace(client)
    await add_member_and_sign_in(client)

    res = await client.post(
        BASE,
        data={"format": "csv"},
        files={"file": ("plane_export.csv", CLEAN_CSV.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 403

    res = await client.get(BASE)
    assert res.status_code == 403


async def test_oversized_upload_is_413(client):
    await setup_admin_workspace(client)
    huge = b"x" * (10 * 1024 * 1024 + 1)
    res = await client.post(
        BASE,
        data={"format": "csv"},
        files={"file": ("plane_export.csv", huge, "text/csv")},
    )
    assert res.status_code == 413


async def test_unsupported_format_is_400(client):
    await setup_admin_workspace(client)
    res = await client.post(
        BASE,
        data={"format": "xml"},
        files={"file": ("plane_export.xml", b"<xml/>", "application/xml")},
    )
    assert res.status_code == 400
