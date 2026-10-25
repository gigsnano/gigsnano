from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from gigsnano_api.models import (
    ELlmUsageOperation,
    ELlmUsageSource,
    LlmUsageEvent,
    Project,
    Workspace,
)


async def _setup(client, db_session, slug="acme", email="ada@example.test"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": email, "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    ws = (await db_session.execute(
        select(Workspace).where(Workspace.slug == slug))).scalar_one()
    return ws


async def _seed(db_session, ws, user_id):
    proj = Project(workspace_id=ws.id, name="Meeting Buddy", identifier="MBA",
                   cover_image_url="https://img.test/cover.jpg")
    db_session.add(proj)
    await db_session.flush()
    now = datetime.now(timezone.utc)
    day = now - timedelta(days=1)
    db_session.add_all([
        LlmUsageEvent(
            workspace_id=ws.id, user_id=user_id, project_id=proj.id,
            source=ELlmUsageSource.BMAD_STORY, operation=ELlmUsageOperation.STREAM_TURN,
            model="claude-sonnet-4", input_tokens=100, output_tokens=50, total_tokens=150,
            estimated_cost_usd=Decimal("0.030000"), created_at=day, updated_at=day),
        LlmUsageEvent(
            workspace_id=ws.id, user_id=user_id, project_id=proj.id,
            source=ELlmUsageSource.GIGS_AI, operation=ELlmUsageOperation.EXTRACT,
            model="claude-sonnet-4", input_tokens=60, output_tokens=40, total_tokens=100,
            estimated_cost_usd=Decimal("0.020000"), created_at=day, updated_at=day),
    ])
    await db_session.commit()


async def test_workspace_ai_usage_aggregates(client, db_session):
    ws = await _setup(client, db_session)
    from gigsnano_api.auth.models import User
    user = (await db_session.execute(
        select(User).where(User.email == "ada@example.test"))).scalar_one()
    await _seed(db_session, ws, user.id)

    r = await client.get(f"/api/workspaces/{ws.slug}/ai-usage/")
    assert r.status_code == 200
    body = r.json()
    # 0.03 + 0.02 USD = 0.05 USD = 5 cents
    assert round(body["total_cost_cents"], 4) == 5.0
    assert body["event_count"] == 2
    assert [e["name"] for e in body["by_project"]] == ["Meeting Buddy"]
    agents = {e["name"] for e in body["by_agent"]}
    assert agents == {"BMAD Agents", "GigsAI"}
    assert body["by_member"][0]["name"] == "Ada"
    assert isinstance(body["timeseries"], list)
    assert "prior_period" in body
    assert "from" in body["period"]


async def test_workspace_ai_usage_empty(client, db_session):
    ws = await _setup(client, db_session, slug="beta", email="beta@example.test")
    r = await client.get(f"/api/workspaces/{ws.slug}/ai-usage/")
    assert r.status_code == 200
    assert r.json()["event_count"] == 0


async def test_workspace_ai_usage_requires_membership(client, db_session):
    ws = await _setup(client, db_session, slug="gamma", email="g@example.test")
    # sign in as a different, non-member user
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"})
    r = await client.get(f"/api/workspaces/{ws.slug}/ai-usage/")
    assert r.status_code == 403


async def test_thread_usage(client, db_session):
    ws = await _setup(client, db_session, slug="delta", email="d@example.test")
    from gigsnano_api.auth.models import User
    user = (await db_session.execute(
        select(User).where(User.email == "d@example.test"))).scalar_one()
    now = datetime.now(timezone.utc)
    db_session.add(LlmUsageEvent(
        workspace_id=ws.id, user_id=user.id, thread_id="th_1",
        source=ELlmUsageSource.BMAD_STORY, operation=ELlmUsageOperation.STREAM_TURN,
        model="claude-sonnet-4", input_tokens=1200, output_tokens=320, total_tokens=1520,
        estimated_cost_usd=Decimal("0.006000"), created_at=now, updated_at=now))
    await db_session.commit()
    r = await client.get(
        f"/api/workspaces/{ws.slug}/projects/p1/stories/s1/thread/th_1/usage/")
    assert r.status_code == 200
    body = r.json()
    assert body["thread_id"] == "th_1"
    assert body["message_count"] == 1
    assert round(body["total_cost_cents"], 4) == 0.6
    assert body["lines"][0]["input_tokens"] == 1200
