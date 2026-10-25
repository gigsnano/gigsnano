"""GIN-387: the autonomy boundary — limits, restricted actions, pause, approvals.

The pure-policy tests carry the weight here: this is the only thing standing
between an agent and a project's committed scope, so every rule is pinned.
"""

from datetime import datetime, timezone

from gigsnano_api.features.autonomy.policy import (
    ActionRequest,
    Limits,
    PolicyView,
    evaluate,
    in_quiet_hours,
)

NOON = datetime(2026, 7, 22, 12, tzinfo=timezone.utc)


def req(**over) -> ActionRequest:
    return ActionRequest(**{"action": "assign_module", **over})


# ── the decision ──────────────────────────────────────────────────────────────

def test_routine_action_within_limits_runs_unattended():
    decision = evaluate(PolicyView(), req(item_count=10), now=NOON)
    assert decision.allowed and not decision.requires_approval
    assert decision.summary == "within policy"


def test_a_restricted_action_always_needs_a_human():
    decision = evaluate(PolicyView(), req(action="change_budget"), now=NOON)
    assert not decision.allowed and decision.requires_approval
    assert "always requires human approval" in decision.summary


def test_default_policy_is_conservative_not_permissive():
    """A project that never configured autonomy still has limits — "absent" must
    never read as "unlimited"."""
    decision = evaluate(PolicyView(), req(item_count=26), now=NOON)
    assert decision.requires_approval
    assert "exceeds the limit of 25" in decision.summary


def test_every_breached_limit_is_reported_not_just_the_first():
    decision = evaluate(
        PolicyView(),
        req(item_count=99, date_shift_days=30, priority_changes=50, reassignments=9),
        now=NOON,
    )
    assert len(decision.reasons) == 4
    assert {"work items", "date shift", "priority changes", "reassignments"} <= {
        phrase for phrase in
        {"work items", "date shift", "priority changes", "reassignments"}
        if any(phrase in r for r in decision.reasons)
    }


def test_a_negative_date_shift_counts_by_magnitude():
    """Pulling a date 30 days earlier is as big a change as pushing it later."""
    decision = evaluate(PolicyView(), req(date_shift_days=-30), now=NOON)
    assert decision.requires_approval and "30-day date shift" in decision.summary


def test_status_transitions_are_denied_unless_listed():
    policy = PolicyView(allowed_status_transitions=(("todo", "in_progress"),))
    allowed = evaluate(policy, req(status_transition=("todo", "in_progress")), now=NOON)
    assert allowed.allowed
    denied = evaluate(policy, req(status_transition=("in_review", "done")), now=NOON)
    assert denied.requires_approval and "not in this project's allowed transitions" in denied.summary


def test_no_transition_list_means_any_transition_is_in_policy():
    decision = evaluate(PolicyView(), req(status_transition=("in_review", "done")), now=NOON)
    assert decision.allowed


def test_pause_refuses_outright_and_says_why():
    policy = PolicyView(paused=True, paused_reason="incident review")
    decision = evaluate(policy, req(), now=NOON)
    assert not decision.allowed and decision.requires_approval
    assert "paused" in decision.summary and "incident review" in decision.summary


def test_pause_beats_an_otherwise_permitted_action():
    """The stop button must not be negotiable by an action that fits the limits."""
    decision = evaluate(PolicyView(paused=True), req(item_count=1), now=NOON)
    assert not decision.allowed


def test_custom_restricted_list_replaces_the_defaults():
    policy = PolicyView(restricted_actions=("assign_owner",))
    assert evaluate(policy, req(action="assign_owner"), now=NOON).requires_approval
    # A project may accept the risk on an action the defaults restrict.
    assert evaluate(policy, req(action="change_budget"), now=NOON).allowed


# ── quiet hours, including the wrap-around that naive comparisons get wrong ────

def test_quiet_hours_within_a_single_day():
    policy = PolicyView(quiet_hours_start=1, quiet_hours_end=6)
    assert in_quiet_hours(policy, NOON.replace(hour=3))
    assert not in_quiet_hours(policy, NOON.replace(hour=8))


def test_quiet_hours_wrapping_midnight():
    policy = PolicyView(quiet_hours_start=22, quiet_hours_end=7)
    assert in_quiet_hours(policy, NOON.replace(hour=23))
    assert in_quiet_hours(policy, NOON.replace(hour=2))
    assert not in_quiet_hours(policy, NOON.replace(hour=12))


def test_quiet_hours_make_an_action_wait_for_a_human():
    policy = PolicyView(quiet_hours_start=22, quiet_hours_end=7)
    decision = evaluate(policy, req(), now=NOON.replace(hour=23))
    assert decision.requires_approval and "quiet hours" in decision.summary


def test_unset_or_equal_quiet_hours_are_never_quiet():
    assert not in_quiet_hours(PolicyView(), NOON)
    assert not in_quiet_hours(PolicyView(quiet_hours_start=9, quiet_hours_end=9), NOON)


def test_tighter_limits_bite():
    policy = PolicyView(limits=Limits(max_items_per_run=2))
    assert evaluate(policy, req(item_count=2), now=NOON).allowed
    assert evaluate(policy, req(item_count=3), now=NOON).requires_approval


# ── the endpoints ─────────────────────────────────────────────────────────────

async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()


async def test_policy_defaults_are_materialized_on_first_read(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    policy = (await client.get(f"{base}/autonomy-policy/")).json()
    assert policy["paused"] is False
    assert policy["limits"]["max_items_per_run"] == 25
    assert "change_budget" in policy["restricted_actions"]


async def test_policy_update_and_action_lifecycle(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"

    patched = (await client.patch(f"{base}/autonomy-policy/", json={
        "max_items_per_run": 3, "allowed_status_transitions": [["todo", "in_progress"]],
    })).json()
    assert patched["limits"]["max_items_per_run"] == 3

    within = (await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "reason": "grouping the payments work", "item_count": 2,
    })).json()
    assert within["decision"]["allowed"] is True
    assert within["action"]["status"] == "auto_approved"

    over = (await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "reason": "big sweep", "item_count": 40,
    })).json()
    assert over["decision"]["requires_approval"] is True
    action_id = over["action"]["id"]
    assert over["action"]["status"] == "pending"
    assert "exceeds the limit of 3" in over["action"]["policy_reason"]

    pending = (await client.get(f"{base}/director-actions/?status_filter=pending")).json()
    assert [i["id"] for i in pending["items"]] == [action_id]

    approved = (await client.post(
        f"{base}/director-actions/{action_id}/approve/", json={"note": "checked the list"}
    )).json()
    assert approved["status"] == "approved"
    assert approved["decided_by_name"] == "Ada" and approved["decided_at"]

    # A decision is immutable: the same action cannot be re-decided.
    again = await client.post(f"{base}/director-actions/{action_id}/reject/", json={})
    assert again.status_code == 409
    assert again.json()["detail"]["error_code"] == "action_already_decided"


async def test_pause_blocks_new_actions_and_resume_restores(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"

    paused = (await client.post(
        f"{base}/autonomy-policy/pause/", json={"reason": "incident"}
    )).json()
    assert paused["paused"] is True and paused["paused_by_id"]

    blocked = (await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "item_count": 1,
    })).json()
    assert blocked["decision"]["allowed"] is False
    assert blocked["action"]["status"] == "pending"
    assert "paused" in blocked["decision"]["summary"]

    # Reads still work while paused — pause stops changes, not visibility.
    assert (await client.get(f"{base}/director-actions/")).status_code == 200

    assert (await client.post(f"{base}/autonomy-policy/resume/")).json()["paused"] is False
    after = (await client.post(f"{base}/director-actions/", json={
        "action": "assign_module", "item_count": 1,
    })).json()
    assert after["decision"]["allowed"] is True


async def test_member_cannot_widen_limits_or_approve_their_own_request(client):
    """The whole point of the boundary: the party being limited cannot move it."""
    from tests.test_project_viewer_readonly import _sign_in, setup_project_with_alan

    project = await setup_project_with_alan(client, "member")
    base = f"/api/workspaces/acme/projects/{project['id']}"
    await _sign_in(client, "alan@example.test")

    requested = (await client.post(f"{base}/director-actions/", json={
        "action": "change_budget", "reason": "needs more",
    })).json()
    assert requested["action"]["status"] == "pending"

    assert (await client.patch(
        f"{base}/autonomy-policy/", json={"max_items_per_run": 999}
    )).status_code == 403
    assert (await client.post(
        f"{base}/director-actions/{requested['action']['id']}/approve/", json={}
    )).status_code == 403
    assert (await client.post(f"{base}/autonomy-policy/pause/", json={})).status_code == 403
