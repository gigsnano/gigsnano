"""GIN-331: per-method estimate inputs on stories — simple size + time duration.

Independent nullable columns; null stays explicitly unestimated (never zero);
invalid values fail visibly; setting one method's value never clears another's.
"""

from tests.test_stories import setup_project


async def _base(client):
    project = await setup_project(client)
    return f"/api/workspaces/acme/projects/{project['id']}"


async def test_defaults_are_null(client):
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Fresh"})).json()
    assert story["size"] is None
    assert story["duration_minutes"] is None


async def test_create_and_read_size(client):
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Sized", "size": "l"})).json()
    assert story["size"] == "l"
    # Consistent across a fresh read (persist + refresh).
    got = (await client.get(f"{base}/stories/{story['id']}/")).json()
    assert got["size"] == "l"


async def test_patch_size_and_duration(client):
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Timed"})).json()
    res = await client.patch(f"{base}/stories/{story['id']}/", json={"duration_minutes": 90})
    assert res.status_code == 200, res.text
    assert res.json()["duration_minutes"] == 90

    res = await client.patch(f"{base}/stories/{story['id']}/", json={"size": "xs"})
    assert res.status_code == 200, res.text
    got = (await client.get(f"{base}/stories/{story['id']}/")).json()
    assert got["size"] == "xs"
    assert got["duration_minutes"] == 90  # untouched by the size write


async def test_invalid_size_fails_visibly(client):
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Bad"})).json()
    res = await client.patch(f"{base}/stories/{story['id']}/", json={"size": "huge"})
    assert res.status_code == 400


async def test_invalid_duration_fails_visibly(client):
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Bad"})).json()
    for bad in (0, -30):
        res = await client.patch(f"{base}/stories/{story['id']}/", json={"duration_minutes": bad})
        assert res.status_code == 400, f"duration {bad} should be rejected"


async def test_null_clears_and_stays_unestimated(client):
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Clear", "size": "m"})).json()
    res = await client.patch(f"{base}/stories/{story['id']}/", json={"size": None})
    assert res.status_code == 200, res.text
    assert res.json()["size"] is None


async def test_size_and_points_coexist(client):
    """Method inputs are independent columns — switching methods preserves each
    raw value; setting a size must not clear points (and vice versa)."""
    base = await _base(client)
    story = (await client.post(f"{base}/stories/", json={"title": "Both"})).json()
    await client.patch(f"{base}/stories/{story['id']}/", json={"estimate_points": 5})
    await client.patch(f"{base}/stories/{story['id']}/", json={"size": "s"})
    got = (await client.get(f"{base}/stories/{story['id']}/")).json()
    assert got["estimate_points"] == 5
    assert got["size"] == "s"
