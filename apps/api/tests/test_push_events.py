"""P3: governance events notify decision makers (never the actor) and push; the
morning digest pushes a briefing line when the user opted in."""

import pytest
from sqlalchemy import select

from gigsnano_api.agent_delegation.router import notify_awaiting_review
from gigsnano_api.features.digests.service import briefing_push_text
from gigsnano_api.features.inbox.recipients import decision_makers
from gigsnano_api.models import (
    Delegation,
    EAgentProvider,
    EDelegationStatus,
    EDelegationUnit,
    Notification,
    PushOutbox,
    Story,
)

PASSWORD = "s3cret!"


def _user(name: str) -> dict:
    return {"display_name": name, "email": f"{name.lower()}@example.test", "password": PASSWORD}


async def _sign_up(client, name: str) -> str:
    await client.post("/api/auth/sign-up/", json=_user(name))
    return (await client.get("/api/auth/me/")).json()["id"]


async def _team(client) -> dict:
    """Ada owns the workspace and acts. Bea is a workspace admin, Cy a plain project
    member, Dan a workspace member outside the project."""
    ids = {}
    for name in ("Bea", "Cy", "Dan"):
        ids[name] = await _sign_up(client, name)
    ids["Ada"] = await _sign_up(client, "Ada")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    for name, role in (("Bea", "admin"), ("Cy", "member"), ("Dan", "member")):
        await client.post("/api/workspaces/acme/members/", json={"user_id": ids[name], "role": role})
    await client.post(f"/api/workspaces/acme/projects/{project['id']}/members/",
                      json={"user_id": ids["Cy"], "role": "member"})
    ids["project"] = project["id"]
    return ids


async def _review_targets(db) -> dict[str, list[str]]:
    notes = (await db.execute(select(Notification))).scalars().all()
    pushes = (await db.execute(select(PushOutbox))).scalars().all()
    return {
        "notes": sorted(n.receiver_id for n in notes if n.kind.value == "review"),
        "pushes": sorted(p.user_id for p in pushes if p.category == "realtime"),
    }


async def test_decision_makers_rule(client, db_session):
    team = await _team(client)
    from gigsnano_api.models import Workspace

    ws = (await db_session.execute(select(Workspace))).scalar_one()
    ids = await decision_makers(db_session, ws.id, team["project"])
    assert team["Ada"] in ids and team["Bea"] in ids
    assert team["Cy"] not in ids and team["Dan"] not in ids
    assert len(ids) == len(set(ids))


async def test_project_admin_is_a_decision_maker(client, db_session):
    team = await _team(client)
    from gigsnano_api.models import ProjectMember, Workspace

    ws = (await db_session.execute(select(Workspace))).scalar_one()
    member = (await db_session.execute(
        select(ProjectMember).where(ProjectMember.user_id == team["Cy"])
    )).scalar_one()
    from gigsnano_api.models import EProjectRole

    member.role = EProjectRole.ADMIN
    await db_session.commit()
    assert team["Cy"] in await decision_makers(db_session, ws.id, team["project"])


async def test_pending_director_action_notifies_decision_makers_not_actor(client, db_session):
    team = await _team(client)
    base = f"/api/workspaces/acme/projects/{team['project']}"
    await client.patch(f"{base}/autonomy-policy/", json={"max_items_per_run": 3})
    res = (await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "reason": "big sweep", "item_count": 40,
    })).json()
    assert res["action"]["status"] == "pending"
    got = await _review_targets(db_session)
    assert got == {"notes": [team["Bea"]], "pushes": [team["Bea"]]}
    row = (await db_session.execute(select(Notification))).scalars().all()[-1]
    assert row.title == "Approval needed: Assign module"


async def test_auto_approved_action_notifies_nobody(client, db_session):
    team = await _team(client)
    base = f"/api/workspaces/acme/projects/{team['project']}"
    await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "reason": "small", "item_count": 1})
    assert await _review_targets(db_session) == {"notes": [], "pushes": []}


async def test_recovery_plan_notifies_decision_makers_not_actor(client, db_session):
    team = await _team(client)
    base = f"/api/workspaces/acme/projects/{team['project']}"
    story = (await client.post(f"{base}/stories/", json={"title": "S", "priority": "low"})).json()
    await client.post(f"{base}/recovery-plans/", json={
        "title": "Recover it", "summary": "why",
        "changes": [{"code": story["code"], "field": "priority", "proposed_value": "urgent",
                     "reason": "r", "confidence": 0.9}],
    })
    assert await _review_targets(db_session) == {
        "notes": [team["Bea"]], "pushes": [team["Bea"]]}


async def test_escalation_notifies_decision_makers_not_actor(client, db_session):
    team = await _team(client)
    base = f"/api/workspaces/acme/projects/{team['project']}"
    res = await client.post(f"{base}/escalations/", json={
        "title": "Vendor stuck", "category": "vendor"})
    assert res.status_code == 201, res.text
    assert await _review_targets(db_session) == {
        "notes": [team["Bea"]], "pushes": [team["Bea"]]}
    note = (await db_session.execute(select(Notification))).scalars().one()
    assert note.title == "Escalation: Vendor stuck" and note.body == "Raised by Ada"


async def test_delegation_awaiting_review_notifies_delegator_once(client, db_session):
    team = await _team(client)
    story = (await client.post(f"/api/workspaces/acme/projects/{team['project']}/stories/",
                               json={"title": "Build it"})).json()
    from gigsnano_api.models import Workspace

    ws = (await db_session.execute(select(Workspace))).scalar_one()
    row = Delegation(
        unit_type=EDelegationUnit.WORK_ITEM, unit_id=story["id"], project_id=team["project"],
        workspace_id=ws.id, provider=EAgentProvider.CODEX, delegated_by=team["Ada"],
        status=EDelegationStatus.AWAITING_REVIEW,
    )
    db_session.add(row)
    await db_session.flush()
    await notify_awaiting_review(db_session, row, EDelegationStatus.RUNNING)
    await notify_awaiting_review(db_session, row, EDelegationStatus.AWAITING_REVIEW)
    await db_session.commit()
    pushes = (await db_session.execute(select(PushOutbox))).scalars().all()
    assert [(p.user_id, p.body) for p in pushes] == [(team["Ada"], "Build it")]
    assert pushes[0].title == "Agent output ready for review"
    assert Story  # model import sanity


@pytest.mark.parametrize(("healths", "needs", "text"), [
    (["on_track", "at_risk", "on_track", "no_data", "on_track", "on_track"], 3,
     "6 projects moving. 1 at risk. 3 need you."),
    (["off_track"], 1, "1 project moving. 1 at risk. 1 needs you."),
    (["on_track", "on_track"], 0, "2 projects moving. Nothing needs you."),
    ([], 0, "No projects yet."),
])
def test_briefing_push_text(healths, needs, text):
    assert briefing_push_text(healths, needs) == text


async def _digest_run(client, db_session, *, push: bool):
    team = await _team(client)
    if push:
        await client.patch("/api/me/push-preferences/", json={"briefing": True})
    story = (await client.post(f"/api/workspaces/acme/projects/{team['project']}/stories/",
                               json={"title": "Mine"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{team['project']}/stories/{story['id']}/",
                       json={"assignee_id": team["Ada"]})
    res = await client.post("/api/workspaces/acme/digests/run/")
    assert res.status_code == 200
    rows = (await db_session.execute(
        select(PushOutbox).where(PushOutbox.category == "briefing")
    )).scalars().all()
    return team, rows


async def test_digest_with_push_channel_adds_one_briefing_row(client, db_session):
    team, rows = await _digest_run(client, db_session, push=True)
    assert [r.user_id for r in rows] == [team["Ada"]]
    assert rows[0].title == "Your GigsNano briefing" and rows[0].data == {"route": "/"}
    assert "project" in rows[0].body


async def test_digest_without_push_channel_adds_none(client, db_session):
    _, rows = await _digest_run(client, db_session, push=False)
    assert rows == []


# --- recipients: who must NOT be notified ---------------------------------


async def _ws_id(db) -> str:
    from gigsnano_api.models import Workspace

    return (await db.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one().id


async def test_admin_of_a_different_workspace_is_not_a_decision_maker(client, db_session):
    team = await _team(client)
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})
    await client.post("/api/workspaces/other/members/", json={"user_id": team["Dan"], "role": "admin"})
    ids = await decision_makers(db_session, await _ws_id(db_session), team["project"])
    assert team["Dan"] not in ids


async def test_pending_project_member_is_not_a_decision_maker(client, db_session):
    from gigsnano_api.models import EMemberStatus, EProjectRole, ProjectMember

    team = await _team(client)
    member = (await db_session.execute(
        select(ProjectMember).where(ProjectMember.user_id == team["Cy"])
    )).scalar_one()
    member.role, member.status = EProjectRole.ADMIN, EMemberStatus.PENDING
    await db_session.commit()
    assert team["Cy"] not in await decision_makers(db_session, await _ws_id(db_session),
                                                   team["project"])


async def _drop_bea(db, team, how: str) -> None:
    from gigsnano_api.models import EMemberStatus, WorkspaceMember

    member = (await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.user_id == team["Bea"])
    )).scalar_one()
    if how == "removed":
        await db.delete(member)
    else:
        member.status = EMemberStatus.PENDING
    await db.commit()


@pytest.mark.parametrize("how", ["removed", "deactivated"])
async def test_removed_or_inactive_workspace_admin_gets_nothing(client, db_session, how):
    team = await _team(client)
    await _drop_bea(db_session, team, how)
    assert team["Bea"] not in await decision_makers(db_session, await _ws_id(db_session),
                                                    team["project"])


async def test_actor_as_only_decision_maker_creates_no_rows(client, db_session):
    team = await _team(client)
    await _drop_bea(db_session, team, "removed")
    base = f"/api/workspaces/acme/projects/{team['project']}"
    await client.patch(f"{base}/autonomy-policy/", json={"max_items_per_run": 3})
    res = (await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "reason": "big sweep", "item_count": 40})).json()
    assert res["action"]["status"] == "pending"
    assert (await db_session.execute(select(Notification))).scalars().all() == []
    assert (await db_session.execute(select(PushOutbox))).scalars().all() == []


# --- delegation push --------------------------------------------------------


async def _delegation(client, db_session, team, delegator: str) -> Delegation:
    story = (await client.post(f"/api/workspaces/acme/projects/{team['project']}/stories/",
                               json={"title": "Build it"})).json()
    row = Delegation(
        unit_type=EDelegationUnit.WORK_ITEM, unit_id=story["id"], project_id=team["project"],
        workspace_id=await _ws_id(db_session), provider=EAgentProvider.CODEX,
        delegated_by=team[delegator], status=EDelegationStatus.AWAITING_REVIEW,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_removed_delegator_gets_no_push(client, db_session):
    from gigsnano_api.models import WorkspaceMember

    team = await _team(client)
    row = await _delegation(client, db_session, team, "Cy")
    member = (await db_session.execute(
        select(WorkspaceMember).where(WorkspaceMember.user_id == team["Cy"])
    )).scalar_one()
    await db_session.delete(member)
    await notify_awaiting_review(db_session, row, EDelegationStatus.RUNNING)
    await db_session.commit()
    assert (await db_session.execute(select(PushOutbox))).scalars().all() == []


async def test_delegator_outside_the_project_gets_no_push(client, db_session):
    team = await _team(client)
    row = await _delegation(client, db_session, team, "Dan")
    await notify_awaiting_review(db_session, row, EDelegationStatus.RUNNING)
    await db_session.commit()
    assert (await db_session.execute(select(PushOutbox))).scalars().all() == []


async def test_notify_failure_never_escapes_the_delegation(client, db_session, monkeypatch):
    team = await _team(client)
    row = await _delegation(client, db_session, team, "Cy")

    async def boom(*args, **kwargs):
        raise RuntimeError("push down")

    monkeypatch.setattr("gigsnano_api.features.notifications.router.notify", boom)
    await notify_awaiting_review(db_session, row, EDelegationStatus.RUNNING)  # no raise
    await db_session.commit()
    assert row.status == EDelegationStatus.AWAITING_REVIEW


# --- morning briefing: one push per user per day ----------------------------


async def _briefing_rows(db) -> list[PushOutbox]:
    return list((await db.execute(
        select(PushOutbox).where(PushOutbox.category == "briefing"))).scalars())


async def test_two_workspaces_give_one_briefing_push(client, db_session):
    team, _ = await _digest_run(client, db_session, push=True)
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    project = (await client.post("/api/workspaces/beta/projects/", json={
        "name": "Beta App", "identifier": "BTA", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    assert "id" in project, project
    story = (await client.post(f"/api/workspaces/beta/projects/{project['id']}/stories/",
                               json={"title": "Mine too"})).json()
    await client.patch(f"/api/workspaces/beta/projects/{project['id']}/stories/{story['id']}/",
                       json={"assignee_id": team["Ada"]})
    assert (await client.post("/api/workspaces/beta/digests/run/")).status_code == 200
    rows = await _briefing_rows(db_session)
    assert [r.user_id for r in rows] == [team["Ada"]]
    assert "Acme" not in rows[0].title and "Beta" not in rows[0].title


async def test_needs_you_without_open_work_still_sends_briefing(client, db_session):
    team = await _team(client)
    await client.patch("/api/me/push-preferences/", json={"briefing": True})
    base = f"/api/workspaces/acme/projects/{team['project']}"
    await client.patch(f"{base}/autonomy-policy/", json={"max_items_per_run": 3})
    await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "reason": "big sweep", "item_count": 40})
    assert (await client.post("/api/workspaces/acme/digests/run/")).status_code == 200
    rows = await _briefing_rows(db_session)
    assert [r.user_id for r in rows] == [team["Ada"]]
    assert "needs you" in rows[0].body


async def test_nothing_to_say_sends_no_briefing(client, db_session):
    await _team(client)
    await client.patch("/api/me/push-preferences/", json={"briefing": True})
    assert (await client.post("/api/workspaces/acme/digests/run/")).status_code == 200
    assert await _briefing_rows(db_session) == []
