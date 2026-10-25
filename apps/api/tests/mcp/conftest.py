from dataclasses import dataclass
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from gigsnano_api.auth.models import User
from gigsnano_api.app import create_app
from gigsnano_api.models.tokens import PersonalAccessToken, generate_token
from tests.test_stories import setup_project


@dataclass
class PatUser:
    token: str
    workspace_slug: str
    user_id: str


@pytest.fixture(autouse=True)
def patch_async_session(db_engine, monkeypatch):
    from gigsnano_api.core import db as core_db

    fresh_maker = async_sessionmaker(db_engine, expire_on_commit=False)
    monkeypatch.setattr(core_db, "async_session", fresh_maker)


@pytest.fixture(autouse=True)
def patch_mcp_api_app(app, monkeypatch):
    import gigsnano_api.mcp_server.api as mcp_api

    monkeypatch.setattr(mcp_api, "_app", app)


@pytest.fixture
async def app(db_engine):
    from gigsnano_api.admin.seed import seed_staff
    from gigsnano_api.core.db import get_db
    from gigsnano_api.mcp_server.server import reset_mcp_runtime

    reset_mcp_runtime()
    application = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def override_get_db():
        async with maker() as session:
            yield session

    application.dependency_overrides[get_db] = override_get_db
    from gigsnano_api.sync.github_oauth import FakeGitHubOAuth

    application.state.github_oauth = FakeGitHubOAuth()
    from gigsnano_api.payments.provider import FakePaymentProvider

    application.state.payment_provider = FakePaymentProvider()
    from gigsnano_api.email.provider import FakeEmailProvider

    application.state.email_provider = FakeEmailProvider()
    FakeEmailProvider.reset()
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    application.state.agent_provider = FakeAgentProvider()
    async with maker() as session:
        await seed_staff(session)
    return application


@pytest.fixture
def mcp_test_client(app):
    from starlette.testclient import TestClient

    with TestClient(app, base_url="http://test") as client:
        yield client


@pytest.fixture
async def pat_for_user(client, db_session):
    await setup_project(client)
    user = (await db_session.execute(select(User))).scalar_one()
    plaintext, digest = generate_token()
    db_session.add(PersonalAccessToken(user_id=user.id, name="mcp-test", token_hash=digest))
    await db_session.commit()
    return PatUser(token=plaintext, workspace_slug="acme", user_id=user.id)


@pytest.fixture
async def seed_project(client, pat_for_user):
    projects = (
        await client.get(f"/api/workspaces/{pat_for_user.workspace_slug}/projects/")
    ).json()
    return SimpleNamespace(**projects[0])


@pytest.fixture
async def seed_story(client, pat_for_user, seed_project):
    created = (
        await client.post(
            f"/api/workspaces/{pat_for_user.workspace_slug}/projects/{seed_project.id}/stories/",
            json={"title": "Test story"},
        )
    ).json()
    return SimpleNamespace(**created)


@pytest.fixture
async def persisted_user(db_session, make_user):
    user = make_user()
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user
