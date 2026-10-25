"""GIN-370 AC4: cross-tenant authorization non-disclosure."""

import httpx
import pytest

from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.mcp_server.tools import ApiError, get_work_item, search_work_items


async def _make_other_tenant(app) -> str:
    """Build a second user + workspace + story the primary user is NOT a member of.
    Returns the secret item's code."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as other:
        await other.post(
            "/api/auth/sign-up/",
            json={"display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"},
        )
        await other.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
        proj = (
            await other.post(
                "/api/workspaces/beta/projects/",
                json={
                    "name": "Bee",
                    "identifier": "BEE",
                    "flow": "fresh",
                    "cover_image_url": "https://img.test/c.jpg",
                },
            )
        ).json()
        secret = (
            await other.post(
                f"/api/workspaces/beta/projects/{proj['id']}/stories/",
                json={"title": "TOP SECRET beta item"},
            )
        ).json()
    return secret["code"]


@pytest.mark.asyncio
async def test_cross_tenant_item_is_not_readable_or_leaked(app, pat_for_user):
    code_b = await _make_other_tenant(app)

    set_bearer(pat_for_user.token)  # ada — member of 'acme' only, never 'beta'
    with pytest.raises(ApiError) as excinfo:
        await get_work_item(code_b)
    # errors without leaking the other tenant's title
    assert "TOP SECRET" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_cross_tenant_item_absent_from_search(app, pat_for_user):
    await _make_other_tenant(app)

    set_bearer(pat_for_user.token)
    hits = await search_work_items(q="TOP SECRET beta item")
    # another tenant's item must not appear in counts, ranking or highlights
    assert hits["total"] == 0
    assert hits["items"] == []
