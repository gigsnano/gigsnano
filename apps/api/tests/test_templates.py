"""GIN-239/240/241/243 — Templates & Recurring Work E2E: create a work-item
template, apply it (preset story + checklist child), draft one via AI, seed a
project's Foundation from a project template, and fire a recurrence via the
scheduler sweep (idempotent). FakeProvider scripts the AI draft.
"""

from datetime import timedelta

from sqlalchemy import select

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.automations.scheduler import advance, sweep_due_recurrences
from gigsnano_api.features.foundation.service import get_foundation
from gigsnano_api.models.stories import Story


async def _ws(client):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "a@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def _project(client, ident="WEB", template_id=None):
    body = {"name": "Web", "identifier": ident, "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg"}
    if template_id:
        body["template_id"] = template_id
    return (await client.post("/api/workspaces/acme/projects/", json=body)).json()["id"]


_WORK_ITEM = {
    "kind": "work_item", "name": "Weekly report",
    "content": {"fields": {"title": "Weekly status report", "type": "task", "priority": "high"},
                "checklist": ["Collect metrics", "Write summary"]},
}


async def test_create_and_apply_work_item_template(app, client, db_session):
    await _ws(client)
    pid = await _project(client)
    tid = (await client.post("/api/workspaces/acme/templates/", json=_WORK_ITEM)).json()["id"]

    applied = await client.post(f"/api/workspaces/acme/projects/{pid}/templates/{tid}/apply/")
    assert applied.status_code == 201
    sid = applied.json()["story_id"]

    story = await db_session.get(Story, sid)
    assert story.title == "Weekly status report" and story.priority.value == "high"
    children = (await db_session.execute(
        select(Story).where(Story.parent_id == sid))).scalars().all()
    assert {c.title for c in children} == {"Collect metrics", "Write summary"}


async def test_ai_draft_template(app, client):
    await _ws(client)
    await _project(client)
    app.state.llm_provider = FakeProvider(extractions=[
        {"name": "Bug triage", "fields": {"title": "Triage: <summary>", "type": "bug",
                                           "priority": "urgent"}, "checklist": ["Reproduce"]}])
    draft = (await client.post("/api/workspaces/acme/templates/draft/",
                               json={"text": "a template for triaging incoming bugs"})).json()
    assert draft["kind"] == "work_item"
    assert draft["content"]["fields"]["type"] == "bug"
    assert draft["content"]["checklist"] == ["Reproduce"]


async def test_project_template_seeds_foundation(app, client, db_session):
    await _ws(client)
    tid = (await client.post("/api/workspaces/acme/templates/", json={
        "kind": "project", "name": "Next app",
        "content": {"foundation": {"preset_key": "next-shadcn"}}})).json()["id"]

    pid = await _project(client, ident="NXT", template_id=tid)
    foundation = await get_foundation(db_session, pid)
    assert foundation is not None and foundation.preset_key == "next-shadcn"
    assert foundation.status == "locked"


async def test_recurrence_fires_and_is_idempotent(app, client, db_session):
    await _ws(client)
    pid = await _project(client)
    tid = (await client.post("/api/workspaces/acme/templates/", json=_WORK_ITEM)).json()["id"]

    rec = await client.post(f"/api/workspaces/acme/projects/{pid}/recurrences/",
                            json={"template_id": tid, "every": 1, "unit": "days"})
    assert rec.status_code == 201
    assert rec.json()["unit"] == "days"

    def _stories():
        return db_session.execute(select(Story).where(Story.project_id == pid, Story.parent_id.is_(None)))

    before = len((await _stories()).scalars().all())

    # Not due yet (next_run is ~1 day out): sweeping "now" fires nothing.
    assert await sweep_due_recurrences(db_session, utcnow()) == 0

    # Due: sweep a time past next_run → one work item created from the template.
    future = utcnow() + timedelta(days=2)
    assert await sweep_due_recurrences(db_session, future) == 1
    await db_session.commit()
    after = len((await _stories()).scalars().all())
    assert after == before + 1

    # Idempotent: next_run advanced past `future`, so re-sweeping the same tick fires nothing.
    assert await sweep_due_recurrences(db_session, future) == 0


def test_advance():
    base = utcnow()
    assert advance(base, {"every": 2, "unit": "hours"}) == base + timedelta(hours=2)
    assert advance(base, {"every": 3, "unit": "days"}) == base + timedelta(days=3)
    assert advance(base, {}) == base + timedelta(days=1)  # safe default
