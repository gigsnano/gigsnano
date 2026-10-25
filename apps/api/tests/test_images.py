import base64

# 1x1 transparent PNG.
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


async def setup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_upload_then_fetch_image(app, client):
    await setup(client)
    res = await client.post(
        "/api/workspaces/acme/images/",
        json={
            "mime_type": "image/png",
            "data": base64.b64encode(PNG_BYTES).decode("ascii"),
            "file_name": "pasted.png",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["url"] == f"/api/workspaces/acme/images/{body['id']}/"

    # Serves the exact bytes with the right content-type to a workspace member
    # (GIN-146: this used to need no auth at all).
    got = await client.get(body["url"])
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.content == PNG_BYTES


async def test_rejects_non_image_mime(app, client):
    await setup(client)
    res = await client.post(
        "/api/workspaces/acme/images/",
        json={"mime_type": "application/pdf", "data": base64.b64encode(b"x").decode("ascii")},
    )
    assert res.status_code == 400


async def test_rejects_invalid_base64(app, client):
    await setup(client)
    res = await client.post(
        "/api/workspaces/acme/images/",
        json={"mime_type": "image/png", "data": "!!!not-base64!!!"},
    )
    assert res.status_code == 400


async def test_fetch_missing_image_404(app, client):
    await setup(client)
    res = await client.get("/api/workspaces/acme/images/does-not-exist/")
    assert res.status_code == 404


async def test_upload_generic_file_served_as_attachment(app, client):
    await setup(client)
    res = await client.post(
        "/api/workspaces/acme/files/",
        json={
            "mime_type": "application/pdf",
            "data": base64.b64encode(b"%PDF-1.4 fake").decode("ascii"),
            "file_name": "spec report.pdf",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["url"] == f"/api/workspaces/acme/files/{body['id']}/"
    assert body["file_name"] == "spec report.pdf"

    got = await client.get(body["url"])
    assert got.status_code == 200
    # Non-image → forced download, filename preserved (RFC 5987 encoded), nosniff.
    assert got.headers["content-disposition"].startswith("attachment")
    assert "spec%20report.pdf" in got.headers["content-disposition"]
    assert got.headers["x-content-type-options"] == "nosniff"
    assert got.content == b"%PDF-1.4 fake"


async def test_image_via_files_endpoint_still_inline(app, client):
    await setup(client)
    res = await client.post(
        "/api/workspaces/acme/files/",
        json={"mime_type": "image/png", "data": base64.b64encode(PNG_BYTES).decode("ascii")},
    )
    got = await client.get(res.json()["url"])
    assert got.headers["content-disposition"].startswith("inline")


async def _upload_image(client, slug="acme") -> str:
    res = await client.post(
        f"/api/workspaces/{slug}/images/",
        json={"mime_type": "image/png", "data": base64.b64encode(PNG_BYTES).decode("ascii")},
    )
    assert res.status_code == 201, res.text
    return res.json()["url"]


async def _fresh_client(app):
    """A client with its own cookie jar — i.e. nobody, until it signs in."""
    import httpx

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_image_is_not_readable_without_a_session(app, client):
    """GIN-146: the bytes must not be world-readable.

    Shipped as an intentional capability URL — "the UUID is the capability", left
    unauthenticated so an image tag could render "without cookies/CORS". That
    rationale is obsolete: /api/* is proxied same-origin from the app and the
    proxy forwards the cookie (lib/api-proxy.ts), so cookie auth reaches here.
    Meanwhile anyone holding a leaked UUID could read any workspace's uploads.
    """
    await setup(client)
    url = await _upload_image(client)

    async with await _fresh_client(app) as anon:
        got = await anon.get(url)
    assert got.status_code in (401, 403), f"served the bytes to nobody: {got.status_code}"


async def test_file_is_not_readable_without_a_session(app, client):
    """The /files/ twin — worse than images: any mime type, up to 25 MB."""
    await setup(client)
    res = await client.post(
        "/api/workspaces/acme/files/",
        json={"mime_type": "application/pdf", "data": base64.b64encode(b"%PDF secret").decode()},
    )
    url = res.json()["url"]

    async with await _fresh_client(app) as anon:
        got = await anon.get(url)
    assert got.status_code in (401, 403), f"served the bytes to nobody: {got.status_code}"


async def test_cannot_read_another_workspaces_image_even_via_own_slug(app, client):
    """Auth alone isn't enough — the slug was cosmetic.

    Lookup was `db.get(ImageAsset, image_id)` by id alone, so a logged-in member
    of their own workspace could read any other workspace's asset by pasting the
    UUID behind their own slug. 404, not 403: a 403 confirms the UUID exists and
    turns this into an existence oracle.
    """
    await setup(client)  # Ada @ acme
    url = await _upload_image(client)
    image_id = url.rstrip("/").rsplit("/", 1)[-1]

    async with await _fresh_client(app) as mallory:
        await mallory.post(
            "/api/auth/sign-up/",
            json={"display_name": "Mallory", "email": "m@example.test", "password": "s3cret!"},
        )
        await mallory.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
        # Mallory is a legitimate member of beta — and asks for it via her OWN slug.
        got = await mallory.get(f"/api/workspaces/beta/images/{image_id}/")
    assert got.status_code == 404, f"leaked across workspaces: {got.status_code}"


async def test_member_can_still_read_and_response_is_privately_cached(app, client):
    """The other half: don't break every image in the app.

    Cache-Control must be `private` once authenticated — `public` would let a
    shared/CDN cache hand one tenant's image to another.
    """
    await setup(client)
    url = await _upload_image(client)

    got = await client.get(url)
    assert got.status_code == 200
    assert got.content == PNG_BYTES
    cache = got.headers["cache-control"]
    assert "private" in cache, cache
    assert "public" not in cache, cache
