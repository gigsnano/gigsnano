from uuid import uuid4

import httpx
import pytest
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from gigsnano_api.app import create_app
from gigsnano_api.core.db import Base, get_db, release_before_background
from gigsnano_api.models import Project, Workspace


@pytest.fixture
def make_user():
    from gigsnano_api.auth.models import User

    def _make_user(email: str = "ada@example.test") -> User:
        return User(email=email, display_name="Ada Lovelace", password_hash="x")

    return _make_user


@pytest.fixture
def make_workspace(db_session):
    async def _make_workspace(**overrides) -> Workspace:
        defaults = {"slug": f"ws-{uuid4().hex[:8]}", "name": "Test Workspace"}
        defaults.update(overrides)
        ws = Workspace(**defaults)
        db_session.add(ws)
        await db_session.commit()
        await db_session.refresh(ws)
        return ws

    return _make_workspace


@pytest.fixture(autouse=True)
def _hermetic_settings():
    # The dev .env points at prod config (context engine ON, real Slack creds).
    # Force the test-relevant flags to their defaults so the suite doesn't depend
    # on whatever the local .env carries. Tests that need the real path opt in via
    # their own monkeypatch (e.g. the scip-fallback test).
    from gigsnano_api.core.config import settings

    settings.context_engine_enabled = False
    # Existing billing tests assert hosted behaviour; self-host default is False.
    settings.billing_enabled = True
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    # The slowapi Limiter is a module-level singleton (route decorators are
    # applied at import time), so its in-memory counters persist across the
    # whole test session unless cleared. Reset before every test so the
    # existing suite's repeated sign-in/sign-up calls never trip a 429.
    from gigsnano_api.core.rate_limit import limiter

    limiter.reset()
    yield


@pytest.fixture(autouse=True)
async def _dispose_module_engine():
    # Background tasks (clone/sync) open sessions via the module-level production
    # engine, which the test's get_db override doesn't touch. Dispose its pool
    # after each test so a connection bound to this test's event loop can't leak
    # into the next test (RuntimeError: Event loop is closed).
    yield
    from gigsnano_api.core import db as _db

    await _db.engine.dispose()


@pytest.fixture
async def db_engine():
    """Fresh in-memory sqlite per test — fast, no external services."""
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    async with maker() as session:
        yield session


@pytest.fixture
async def app(db_engine):
    """App with the DB dependency overridden; BMAD tests also swap app.state.llm_provider."""
    application = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def override_get_db(background: BackgroundTasks):
        async with maker() as session:
            release_before_background(session, background)
            yield session

    application.dependency_overrides[get_db] = override_get_db
    # Tests must stay hermetic: the real .env may carry GitHub OAuth creds (which
    # would make build_oauth() return the live client), so force the fake here.
    from gigsnano_api.sync.github_oauth import FakeGitHubOAuth

    application.state.github_oauth = FakeGitHubOAuth()
    from gigsnano_api.payments.provider import FakePaymentProvider

    application.state.payment_provider = FakePaymentProvider()
    from gigsnano_api.email.provider import FakeEmailProvider

    application.state.email_provider = FakeEmailProvider()
    FakeEmailProvider.reset()
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    application.state.agent_provider = FakeAgentProvider()
    # The real .env may carry Slack creds, which would make build_slack_oauth()
    # return the live client (real code exchange → 400 on a fake code). Force fake.
    from gigsnano_api.sync.slack_oauth import FakeSlackOAuth

    application.state.slack_oauth = FakeSlackOAuth()
    from gigsnano_api.meetings.provider import FakeMeetingBotProvider

    application.state.meeting_provider = FakeMeetingBotProvider()
    return application


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def make_project(db_session):
    """Insert a Workspace + Project row via db_session and return the committed
    Project. Kwargs override the Project defaults (name/identifier/cover etc.)."""

    async def _make_project(**overrides) -> Project:
        workspace = Workspace(slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
        db_session.add(workspace)
        await db_session.flush()

        defaults = {
            "workspace_id": workspace.id,
            "name": "Test Project",
            "identifier": "TST",
            "cover_image_url": "https://img.test/cover.jpg",
        }
        defaults.update(overrides)
        project = Project(**defaults)
        db_session.add(project)
        await db_session.commit()
        await db_session.refresh(project)
        return project

    return _make_project


@pytest.fixture
def background_tasks_stub():
    class Stub:
        def __init__(self):
            self.tasks: list[tuple] = []

        def add_task(self, fn, *args, **kwargs):
            self.tasks.append((fn, args, kwargs))

        async def run_all(self):
            for fn, args, kwargs in self.tasks:
                await fn(*args, **kwargs)

    return Stub()


@pytest.fixture
def make_workspace_ctx():
    """Build a (ToolContext, Workspace) pair for agent-tool tests, mirroring the
    ToolContext(db=..., workspace=..., user=..., role=...) construction in
    test_code_tools.py. Not async: the Workspace/User need only stable .id values
    (sqlite here has no FK enforcement), so no DB round-trip is required."""

    def _make(db, role: str = "admin"):
        from gigsnano_api.agent.tools.base import ToolContext
        from gigsnano_api.auth.models import User

        # Explicit id: the base model's id default only applies on flush, and this
        # fixture stays sync (no DB round-trip) so callers can invoke it without await.
        ws = Workspace(id=str(uuid4()), slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
        user = User(id=str(uuid4()), email="ctx@example.test", display_name="Ctx User", password_hash="x")
        return ToolContext(db=db, workspace=ws, user=user, role=role), ws

    return _make


@pytest.fixture
def make_workspace_member_user(db_session):
    async def _make(email_digest: bool = True, email: str = "member@test.com"):
        from gigsnano_api.auth.models import User
        from gigsnano_api.models import EMemberStatus, EWorkspaceRole, Workspace, WorkspaceMember

        user = User(
            email=email,
            display_name="Member",
            password_hash="x",
            email_digest=email_digest,
        )
        ws = Workspace(slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
        db_session.add_all([user, ws])
        await db_session.flush()
        db_session.add(
            WorkspaceMember(
                workspace_id=ws.id,
                user_id=user.id,
                role=EWorkspaceRole.MEMBER,
                status=EMemberStatus.ACTIVE,
            )
        )
        await db_session.commit()
        await db_session.refresh(user)
        await db_session.refresh(ws)
        return ws, user

    return _make
