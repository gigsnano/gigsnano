import pytest

from gigsnano_api.mcp_server.auth import PatTokenVerifier
from gigsnano_api.models.tokens import PersonalAccessToken, generate_token


@pytest.mark.asyncio
async def test_valid_pat_resolves_user(db_session, make_user):
    user = make_user()
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    plaintext, digest = generate_token()
    db_session.add(PersonalAccessToken(user_id=user.id, name="t", token_hash=digest))
    await db_session.commit()
    verifier = PatTokenVerifier()
    token = await verifier.verify_token(plaintext)
    assert token is not None
    assert token.subject == user.id


@pytest.mark.asyncio
async def test_invalid_pat_returns_none(db_session):
    verifier = PatTokenVerifier()
    assert await verifier.verify_token("gnp_nope") is None
