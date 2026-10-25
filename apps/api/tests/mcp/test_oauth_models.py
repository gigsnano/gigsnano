import pytest
from sqlalchemy import select

from gigsnano_api.models.oauth import OAuthClient


@pytest.mark.asyncio
async def test_oauth_client_persists(db_session):
    db_session.add(
        OAuthClient(
            client_id="c_abc",
            client_name="Claude",
            redirect_uris=["http://localhost:8080/cb"],
        )
    )
    await db_session.commit()
    row = (
        await db_session.execute(select(OAuthClient).where(OAuthClient.client_id == "c_abc"))
    ).scalar_one()
    assert row.redirect_uris == ["http://localhost:8080/cb"]
