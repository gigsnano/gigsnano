import base64

from tests.fixtures.pdf_samples import SAMPLE_PDF
from tests.helpers import sprint_zero

CREATE_PROJECT = {
    "name": "Mobile App",
    "identifier": "MBA",
    "flow": "fresh",
    "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}


async def setup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={
            "display_name": "Ada Lovelace",
            "email": "ada@example.test",
            "password": "s3cret!",
        },
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


async def test_upload_story_document_then_lists(app, client):
    project = await setup(client)
    sid = (await sprint_zero(client, project["id"]))[0]["id"]
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{sid}"
    res = await client.post(
        f"{base}/documents/",
        json={
            "title": "Spec.md",
            "project_id": project["id"],
            "story_id": sid,
            "file_name": "Spec.md",
            "mime_type": "text/markdown",
            "content": "# Spec\n\nUploaded reference.",
        },
    )
    assert res.status_code == 201
    doc = res.json()
    assert doc["source"] == "user" and doc["story_id"] == sid
    assert doc["file_name"] == "Spec.md" and doc["mime_type"] == "text/markdown"
    listed = (await client.get(f"{base}/documents/")).json()
    assert any(d["id"] == doc["id"] for d in listed)


async def test_upload_pdf_extracts_markdown_content(app, client):
    project = await setup(client)
    sid = (await sprint_zero(client, project["id"]))[0]["id"]
    encoded = base64.b64encode(SAMPLE_PDF).decode("ascii")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{sid}"
    res = await client.post(
        f"{base}/documents/",
        json={
            "title": "Requirements",
            "project_id": project["id"],
            "story_id": sid,
            "file_name": "requirements.pdf",
            "mime_type": "application/pdf",
            "content": f"data:application/pdf;base64,{encoded}",
        },
    )
    assert res.status_code == 201
    doc = res.json()
    assert "data:application/pdf" not in doc["content"]
    assert doc["content"].strip()
    assert "requirements" in doc["content"].lower() or "hello" in doc["content"].lower()
