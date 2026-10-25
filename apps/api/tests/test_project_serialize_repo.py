async def test_created_project_serializes_clone_status(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "A", "email": "a@x.test", "password": "s3cret!"})
    ws = (await client.post("/api/workspaces/", json={"name": "W", "slug": "ws"})).json()
    proj = (await client.post(f"/api/workspaces/{ws['slug']}/projects/", json={
        "name": "P", "identifier": "P", "flow": "fresh", "has_ui": True,
        "cover_image_url": "https://img.test/c.jpg"})).json()
    assert proj["clone_status"] == "none"
    assert proj["repo_full_name"] is None
