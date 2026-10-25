from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, LlmUsageEvent, Workspace
from tests.helpers import make_staff


async def _seed_usage_events(db_session):
    actor = (
        await db_session.execute(select(User).where(User.email == "ada@example.test"))
    ).scalar_one()
    colleague = User(id="u-colleague", email="teo@example.test", display_name="Teo")
    ws_acme = Workspace(slug="acme", name="Acme")
    ws_globex = Workspace(slug="globex", name="Globex")
    db_session.add_all([colleague, ws_acme, ws_globex])
    await db_session.flush()

    base = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)
    events = [
        LlmUsageEvent(
            workspace_id=ws_acme.id,
            user_id=actor.id,
            source=ELlmUsageSource.BMAD_STORY,
            operation=ELlmUsageOperation.STREAM_TURN,
            model="gpt-4.1-mini",
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
            estimated_cost_usd=Decimal("0.003000"),
            created_at=base,
            updated_at=base,
        ),
        LlmUsageEvent(
            workspace_id=ws_acme.id,
            user_id=colleague.id,
            source=ELlmUsageSource.GIGS_AI,
            operation=ELlmUsageOperation.EXTRACT,
            model="gpt-4.1-mini",
            input_tokens=60,
            output_tokens=40,
            total_tokens=100,
            estimated_cost_usd=Decimal("0.002000"),
            created_at=base + timedelta(hours=4),
            updated_at=base + timedelta(hours=4),
        ),
        LlmUsageEvent(
            workspace_id=ws_globex.id,
            user_id=actor.id,
            source=ELlmUsageSource.GIGS_AI,
            operation=ELlmUsageOperation.FINALIZE_DESCRIPTION,
            model="gpt-4.1-mini",
            input_tokens=20,
            output_tokens=30,
            total_tokens=50,
            estimated_cost_usd=Decimal("0.001000"),
            created_at=base + timedelta(days=1),
            updated_at=base + timedelta(days=1),
        ),
        # Outside main window to validate filtering.
        LlmUsageEvent(
            workspace_id=ws_globex.id,
            user_id=actor.id,
            source=ELlmUsageSource.BMAD_STORY,
            operation=ELlmUsageOperation.STREAM_TURN,
            model="gpt-4.1-mini",
            input_tokens=500,
            output_tokens=500,
            total_tokens=1000,
            estimated_cost_usd=Decimal("0.020000"),
            created_at=base - timedelta(days=10),
            updated_at=base - timedelta(days=10),
        ),
    ]
    db_session.add_all(events)
    await db_session.commit()
    return base, ws_acme.id, actor.id


async def test_llm_usage_summary_returns_totals(client, db_session):
    await make_staff(client, db_session)
    base, _, _ = await _seed_usage_events(db_session)
    res = await client.get(
        "/api/admin/llm-usage/summary/",
        params={
            "from": base.isoformat(),
            "to": (base + timedelta(days=2)).isoformat(),
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["input_tokens"] == 180
    assert body["output_tokens"] == 120
    assert body["total_tokens"] == 300
    assert body["event_count"] == 3
    assert body["estimated_cost_usd"] == 0.006
    assert body["by_source"]["bmad_story"]["tokens"] == 150
    assert body["by_operation"]["extract"]["count"] == 1
    assert datetime.fromisoformat(body["period"]["from"].replace("Z", "+00:00")) == base
    assert datetime.fromisoformat(body["period"]["to"].replace("Z", "+00:00")) == (
        base + timedelta(days=2)
    )


async def test_llm_usage_requires_usage_read_privilege(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["roles.read"])
    assert (await client.get("/api/admin/llm-usage/summary/")).status_code == 403


async def test_llm_usage_events_pagination(client, db_session):
    await make_staff(client, db_session)
    base, _, _ = await _seed_usage_events(db_session)
    res = await client.get(
        "/api/admin/llm-usage/events/",
        params={
            "from": base.isoformat(),
            "to": (base + timedelta(days=2)).isoformat(),
            "limit": 2,
            "offset": 1,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert body["limit"] == 2
    assert body["offset"] == 1
    assert len(body["items"]) == 2
    assert body["items"][0]["workspace_name"] in {"Acme", "Globex"}
    assert body["items"][0]["user_display_name"] in {"Ada", "Teo"}


async def test_llm_usage_heatmap_daily_returns_cells(client, db_session):
    await make_staff(client, db_session)
    base, _, _ = await _seed_usage_events(db_session)
    res = await client.get(
        "/api/admin/llm-usage/heatmap-daily/",
        params={
            "from": base.isoformat(),
            "to": (base + timedelta(days=2)).isoformat(),
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 2
    assert body[0]["date"] == "2026-07-01"
    assert body[0]["total_tokens"] == 250
    assert body[1]["date"] == "2026-07-02"
    assert body[1]["event_count"] == 1
