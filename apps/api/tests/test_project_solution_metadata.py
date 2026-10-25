from gigsnano_api.models import Project

CREATE = {
    "name": "Mobile Banking App", "identifier": "MBA", "flow": "fresh",
    "has_ui": True, "cover_image_url": "https://img.test/c.jpg",
}


async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_new_project_stores_software_delivery_metadata(client):
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    assert project["solution_key"] == "software_delivery"
    assert project["solution_version"] == 1


async def test_null_metadata_reads_as_software_delivery(client, db_session):
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    row = await db_session.get(Project, project["id"])
    row.solution_key = None
    row.solution_version = None
    await db_session.commit()
    fetched = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/")).json()
    assert fetched["solution_key"] == "software_delivery"
    assert fetched["solution_version"] == 1
