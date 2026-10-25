"""GIN-252/253/254 — NL automations: compile flags unsupported asks, a rule fires
on a matching story.updated event (executing an allowlisted action + audit),
skips on mismatch, and dry-run has zero side effects. FakeProvider scripts the
compiled AST so no key is needed.
"""

from sqlalchemy import select

from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.automations.dispatcher import _cmp, conditions_match
from gigsnano_api.features.automations.schemas import Condition
from gigsnano_api.models.billing import EPlanTier
from gigsnano_api.models.stories import StoryComment
from gigsnano_api.models.workspace import Workspace


async def _pro(db):
    """Automations require the Pro entitlement (GIN-234)."""
    ws = (await db.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    sub = await get_or_create_subscription(db, ws.id)
    sub.tier = EPlanTier.PRO
    await db.commit()

# A rule: when a story is updated to urgent priority, leave a comment.
_AST = {
    "trigger": "story.updated",
    "conditions": [{"field": "priority", "op": "eq", "value": "urgent"}],
    "actions": [{"type": "comment", "params": {"body": "Escalated by automation"}}],
    "unsupported": ["post to Slack"],
}


async def _project(client):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "a@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/",
                              json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                                    "cover_image_url": "https://img.test/c.jpg"})).json()["id"]


async def test_preview_flags_unsupported(app, client):
    pid = await _project(client)
    app.state.llm_provider = FakeProvider(extractions=[_AST])
    ast = (await client.post(f"/api/workspaces/acme/projects/{pid}/automation-rules/preview/",
                             json={"text": "when urgent, comment and post to Slack"})).json()
    assert ast["trigger"] == "story.updated"
    assert ast["unsupported"] == ["post to Slack"]          # flagged, never dropped
    assert ast["actions"][0]["type"] == "comment"


async def test_rule_fires_on_match_and_is_audited(app, client, db_session):
    pid = await _project(client)
    sid = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                             json={"title": "Checkout bug"})).json()["id"]

    await _pro(db_session)
    app.state.llm_provider = FakeProvider(extractions=[_AST])
    rule = (await client.post(f"/api/workspaces/acme/projects/{pid}/automation-rules/",
                              json={"name": "Escalate urgent", "text": "..."})).json()
    assert rule["trigger_event"] == "story.updated"

    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}"

    # Mismatch: a non-urgent update fires nothing.
    await client.patch(f"{base}/", json={"priority": "low"})
    assert (await client.get(f"/api/workspaces/acme/projects/{pid}/automation-rules/{rule['id']}/runs/")).json() == []

    # Match: urgent → the comment action runs and is audited.
    await client.patch(f"{base}/", json={"priority": "urgent"})
    comments = (await db_session.execute(
        select(StoryComment).where(StoryComment.story_id == sid)
    )).scalars().all()
    assert [c.body for c in comments] == ["Escalated by automation"]

    runs = (await client.get(
        f"/api/workspaces/acme/projects/{pid}/automation-rules/{rule['id']}/runs/")).json()
    assert len(runs) == 1
    assert runs[0]["status"] == "matched"
    assert runs[0]["actions_taken"][0]["result"] == "commented"


async def test_dry_run_has_zero_side_effects(app, client, db_session):
    pid = await _project(client)
    sid = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                             json={"title": "X"})).json()["id"]
    await _pro(db_session)
    app.state.llm_provider = FakeProvider(extractions=[_AST])
    rule = (await client.post(f"/api/workspaces/acme/projects/{pid}/automation-rules/",
                              json={"name": "r", "text": "..."})).json()

    dr = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/automation-rules/{rule['id']}/dry-run/",
        json={"event_data": {}})).json()
    assert dr["dry_run"] is True
    assert "(dry-run)" in dr["actions_taken"][0]["result"]
    # No comment was created on any story.
    comments = (await db_session.execute(select(StoryComment))).scalars().all()
    assert comments == []


def test_condition_matching():
    assert _cmp("eq", "urgent", "urgent") is True
    assert _cmp("neq", "low", "urgent") is True
    assert _cmp("contains", "Login is broken", "broken") is True
    assert _cmp("in", "bug", ["bug", "feature"]) is True
    conds = [Condition(field="priority", op="eq", value="urgent"),
             Condition(field="type", op="in", value=["bug", "feature"])]
    assert conditions_match(conds, {"priority": "urgent", "type": "bug"}) is True
    assert conditions_match(conds, {"priority": "low", "type": "bug"}) is False
