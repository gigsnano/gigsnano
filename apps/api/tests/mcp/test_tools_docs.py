import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer


from tests.mcp.payload import dumps

# 1x1 PNG (valid signature) — smallest real image for a positive-path check.
_PNG_1x1 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


@pytest.mark.asyncio
async def test_attach_file_accepts_valid_png(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    output = await tools.attach_file(
        code=seed_story.code,
        title="Screenshot",
        file_name="shot.png",
        mime_type="image/png",
        content=_PNG_1x1,
    )
    assert "shot.png" in dumps(output)


@pytest.mark.asyncio
async def test_attach_file_rejects_fake_image(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError) as err:
        await tools.attach_file(
            code=seed_story.code,
            title="x",
            file_name="s.png",
            mime_type="image/png",
            content="AAAA",  # decodes, but not a PNG signature
        )
    assert err.value.status == 422


@pytest.mark.asyncio
async def test_list_comments(pat_for_user, seed_story):
    set_bearer(pat_for_user.token)
    await tools.add_comment(code=seed_story.code, body="hi")
    output = await tools.list_comments(code=seed_story.code)
    assert "hi" in dumps(output)
