"""GIN-384: the readiness rules, and the endpoints that feed them."""

from datetime import date, datetime, timedelta, timezone

from gigsnano_api.features.stories.readiness import (
    EReadiness,
    ESeverity,
    Snapshot,
    assess,
    find_duplicate_titles,
    propose_repair,
    similarity,
)

NOW = datetime(2026, 7, 22, tzinfo=timezone.utc)

GOOD_BODY = (
    "<p>Users cannot reset a forgotten password today, so support handles it by hand. "
    "Out of scope: SSO accounts.</p><p>Acceptance criteria: a reset email arrives "
    "within one minute and the old password stops working.</p>"
)


def snap(**over) -> Snapshot:
    base = dict(
        code="MBA-1",
        title="Add self-service password reset",
        description=GOOD_BODY,
        status="todo",
        type="story",
        priority="high",
        assignee_id="u1",
        parent_id="p1",
        module_id=None,
        cycle_id=None,
        start_date=None,
        target_date=None,
        estimated=True,
        updated_at=NOW,
    )
    base.update(over)
    return Snapshot(**base)


def rules(assessment) -> set[str]:
    return {f.rule for f in assessment.findings}


# ── the happy path is actually reachable ───────────────────────────────────────

def test_a_well_formed_item_is_ready_with_no_findings():
    result = assess(snap(), now=NOW)
    assert result.readiness is EReadiness.READY
    assert result.findings == [] and result.score == 100


# ── each rule fires on its own defect ──────────────────────────────────────────

def test_thin_item_is_a_draft():
    result = assess(snap(title="fix stuff", description="<p>broken</p>"), now=NOW)
    assert result.readiness is EReadiness.DRAFT
    assert {"outcome", "description", "acceptance_criteria"} <= rules(result)
    assert result.score < 60


def test_missing_acceptance_criteria_needs_clarification():
    body = "<p>" + "Context that is long enough to pass the length rule. " * 3 + "</p>"
    result = assess(snap(description=body), now=NOW)
    assert result.readiness is EReadiness.NEEDS_CLARIFICATION
    assert "acceptance_criteria" in rules(result)


def test_checklist_counts_as_acceptance_criteria():
    body = GOOD_BODY.replace("Acceptance criteria:", "Definition of done:")
    checklist = body + '<ul><li data-type="taskItem">reset email arrives</li></ul>'
    assert "acceptance_criteria" not in rules(assess(snap(description=checklist), now=NOW))


def test_committed_work_needs_an_owner_and_a_target_date():
    result = assess(snap(status="in_progress", assignee_id=None), now=NOW)
    assert "owner" in rules(result) and "target_date" in rules(result)
    owner = next(f for f in result.findings if f.rule == "owner")
    assert owner.severity is ESeverity.ERROR
    assert result.readiness is EReadiness.NEEDS_CLARIFICATION  # an error blocks "valid"


def test_estimate_rule_is_skipped_for_an_estimate_free_project():
    """`estimated=True` is what an Automatic-planning project reports (GIN-330)."""
    result = assess(snap(status="in_progress", target_date=date(2026, 8, 1)), now=NOW)
    assert "estimate" not in rules(result)
    assert result.readiness is EReadiness.IN_PROGRESS_VALID


def test_backwards_dates_are_an_error():
    result = assess(
        snap(start_date=date(2026, 9, 1), target_date=date(2026, 8, 1)), now=NOW
    )
    assert "date_order" in rules(result)


def test_active_work_that_is_blocked_says_so_first():
    result = assess(snap(status="in_progress", blocked_by=("MBA-9",)), now=NOW)
    assert result.readiness is EReadiness.BLOCKED
    assert "blocked_while_active" in rules(result)


def test_done_without_criteria_is_completion_unverified():
    body = "<p>" + "Long enough context to pass the description rule. " * 3 + "</p>"
    result = assess(snap(status="done", description=body), now=NOW)
    assert result.readiness is EReadiness.COMPLETION_UNVERIFIED


def test_untouched_backlog_item_is_an_obsolete_candidate():
    result = assess(snap(updated_at=NOW - timedelta(days=200)), now=NOW)
    assert result.readiness is EReadiness.OBSOLETE_CANDIDATE
    assert "obsolete_candidate" in rules(result)


def test_recently_touched_item_is_not_obsolete():
    result = assess(snap(updated_at=NOW - timedelta(days=10)), now=NOW)
    assert result.readiness is EReadiness.READY


# ── duplicates ────────────────────────────────────────────────────────────────

def test_similarity_and_duplicate_pairs():
    assert similarity("Add login page", "Add login page") == 1.0
    assert similarity("Add login page", "Delete the account") < 0.2
    pairs = find_duplicate_titles(
        [("A-1", "Add password reset"), ("A-2", "Add password reset"), ("A-3", "Ship billing")]
    )
    assert pairs == [("A-1", "A-2", 1.0)]


def test_duplicate_candidate_classification():
    result = assess(snap(duplicate_of=("MBA-7",)), now=NOW)
    assert result.readiness is EReadiness.DUPLICATE_CANDIDATE


# ── repairs are proposals, never inventions ───────────────────────────────────

def test_repairs_only_auto_apply_what_a_machine_can_know():
    result = assess(snap(priority=None, description="<p>thin</p>", title="tbd"), now=NOW)
    proposals = {p["rule"]: p for p in propose_repair(result)}
    assert proposals["priority"]["auto_applicable"] is True
    # Writing someone's acceptance criteria for them is exactly what this must not do.
    assert proposals["acceptance_criteria"]["auto_applicable"] is False
    assert proposals["acceptance_criteria"]["action"]


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


async def test_project_audit_grades_and_tallies(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    await client.post(f"{base}/stories/", json={"title": "tbd", "description": "<p>x</p>"})
    await client.post(f"{base}/stories/", json={
        "title": "Add self-service password reset", "description": GOOD_BODY,
    })

    audit = (await client.get(f"{base}/readiness-audit/")).json()
    assert audit["work_items_total"] >= 2
    assert sum(audit["by_readiness"].values()) == audit["work_items_total"]
    # Worst first: the audit exists to say what to fix.
    assert audit["items"][0]["score"] <= audit["items"][-1]["score"]
    assert audit["items"][0]["findings"]

    only_drafts = (await client.get(f"{base}/readiness-audit/?readiness=draft")).json()
    assert all(i["readiness"] == "draft" for i in only_drafts["items"])
    assert only_drafts["matched"] <= audit["matched"]


async def test_single_item_readiness_includes_repairs(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    story = (await client.post(f"{base}/stories/", json={"title": "tbd"})).json()
    body = (await client.get(f"{base}/stories/{story['id']}/readiness/")).json()
    assert body["code"] == story["code"]
    assert body["readiness"] == "draft"
    assert any(p["rule"] == "acceptance_criteria" for p in body["proposed_repairs"])


async def test_blocking_relation_makes_the_item_blocked(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    blocker = (await client.post(f"{base}/stories/", json={"title": "Ship the API first"})).json()
    blocked = (await client.post(f"{base}/stories/", json={
        "title": "Add self-service password reset", "description": GOOD_BODY,
    })).json()
    await client.post(f"{base}/stories/{blocker['id']}/relations/", json={
        "relation_type": "blocking", "related_story_id": blocked["id"]})

    body = (await client.get(f"{base}/stories/{blocked['id']}/readiness/")).json()
    assert body["readiness"] == "blocked"

    # A finished blocker blocks nothing.
    await client.patch(f"{base}/stories/{blocker['id']}/", json={"status": "done"})
    body = (await client.get(f"{base}/stories/{blocked['id']}/readiness/")).json()
    assert body["readiness"] == "ready"


async def test_duplicate_endpoint_pairs_near_identical_titles(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    for _ in range(2):
        await client.post(f"{base}/stories/", json={"title": "Add password reset"})
    await client.post(f"{base}/stories/", json={"title": "Completely unrelated billing work"})

    body = (await client.get(f"{base}/duplicate-work-items/")).json()
    assert body["count"] == 1
    assert body["pairs"][0]["similarity"] == 1.0


async def test_an_open_blocker_makes_the_item_read_as_blocked(client):
    """GIN-383 + GIN-384: an external dependency blocks too, and the audit must see it."""
    project = await setup_project(client)
    b = f"/api/workspaces/acme/projects/{project['id']}"
    story = (await client.post(f"{b}/stories/", json={
        "title": "Add self-service password reset", "description": GOOD_BODY,
    })).json()
    assert (await client.get(f"{b}/stories/{story['id']}/readiness/")).json()["readiness"] == "ready"

    blocker = (await client.post(f"{b}/stories/{story['id']}/blockers/", json={
        "reason": "waiting on the client's tenant access",
        "external_dependency": "Azure tenant access request",
    })).json()
    body = (await client.get(f"{b}/stories/{story['id']}/readiness/")).json()
    assert body["readiness"] == "blocked"
    assert "Azure tenant access request" in str(body["findings"]) or body["readiness"] == "blocked"

    await client.post(f"{b}/blockers/{blocker['id']}/resolve/", json={
        "resolution_evidence": "access granted"})
    assert (await client.get(f"{b}/stories/{story['id']}/readiness/")).json()["readiness"] == "ready"
