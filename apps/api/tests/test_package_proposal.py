"""GIN-396: findings become a reviewable change set, and only that."""

from gigsnano_api.features.package_import.proposal import (
    blocking_conflicts,
    propose_changes,
)
from gigsnano_api.models.packages import PackageFinding


def _finding(kind, title, *, status="proposed", confidence=0.9, anchor="Spec > Phases",
             override=None, detail="") -> PackageFinding:
    return PackageFinding(
        id=f"f-{title.lower().replace(' ', '-')}",
        package_id="pkg",
        document_id="doc",
        kind=kind,
        status=status,
        title=title,
        detail=detail,
        confidence=confidence,
        anchor=anchor,
        override=override,
    )


def test_preserve_mirrors_the_supplied_plan():
    changes = propose_changes(
        [_finding("phase", "Phase 0"), _finding("task", "Set up CI")], "preserve"
    )
    by_target = {c.target: c for c in changes}
    assert set(by_target) == {"cycle", "epic", "story"}  # no milestone invented
    assert by_target["story"].parent_temp_key == by_target["epic"].temp_key


def test_convert_produces_the_canonical_shape():
    changes = propose_changes(
        [
            _finding("module", "Check-in"),
            _finding("phase", "Phase 0"),
            _finding("requirement", "Users can clock in"),
            _finding("task", "Set up CI"),
        ],
        "convert",
    )
    targets = sorted({c.target for c in changes})
    assert targets == ["cycle", "epic", "milestone", "module", "story"]


def test_a_task_hangs_off_its_phase_epic():
    changes = propose_changes(
        [
            _finding("phase", "Phase 0"),
            _finding("task", "Set up CI"),
            _finding("phase", "Phase 1"),
            _finding("task", "Build login"),
        ],
        "convert",
    )
    stories = {c.title: c for c in changes if c.target == "story"}
    assert stories["Set up CI"].parent_temp_key == "epic:phase-0"
    assert stories["Build login"].parent_temp_key == "epic:phase-1"


def test_a_conflict_is_never_proposed_as_work():
    findings = [
        _finding("decision", "Stack is React Native", status="conflict"),
        _finding("task", "Set up CI"),
    ]
    changes = propose_changes(findings, "convert")
    assert "Stack is React Native" not in [c.title for c in changes]
    assert [f.title for f in blocking_conflicts(findings)] == ["Stack is React Native"]


def test_assumptions_and_gaps_are_flagged_for_review():
    changes = propose_changes(
        [_finding("task", "Guessed task", status="assumption")], "convert"
    )
    assert changes[0].status == "needs_review"


def test_hybrid_only_lets_high_confidence_through_unflagged():
    findings = [
        _finding("task", "Certain task", confidence=0.95),
        _finding("task", "Shaky task", confidence=0.4),
    ]
    statuses = {c.title: c.status for c in propose_changes(findings, "hybrid")}
    assert statuses["Certain task"] == "proposed"
    assert statuses["Shaky task"] == "needs_review"


def test_a_user_override_wins_over_the_ai_status():
    findings = [_finding("task", "Overridden", status="assumption",
                         override={"status": "approved"})]
    assert propose_changes(findings, "convert")[0].status == "proposed"


def test_duplicate_findings_propose_one_object():
    findings = [_finding("module", "Check-in"), _finding("module", "Check-in")]
    assert len(propose_changes(findings, "convert")) == 1


def test_every_change_cites_the_finding_that_justifies_it():
    changes = propose_changes([_finding("task", "Set up CI")], "convert")
    assert changes[0].finding_id == "f-set-up-ci"
    assert "Spec > Phases" in changes[0].reason


def test_temp_keys_are_stable_across_reproposal():
    findings = [_finding("phase", "Phase 0"), _finding("task", "Set up CI")]
    first = [c.temp_key for c in propose_changes(findings, "convert")]
    second = [c.temp_key for c in propose_changes(findings, "convert")]
    assert first == second


def test_prerequisites_become_blockers_and_dependencies_become_relations():
    changes = propose_changes(
        [
            _finding("prerequisite", "Odoo API access"),
            _finding("dependency", "Login before check-in"),
            _finding("risk", "Store accounts missing", status="blocked"),
            _finding("risk", "Timeline is tight"),
        ],
        "convert",
    )
    by_target = {}
    for change in changes:
        by_target.setdefault(change.target, []).append(change.title)
    assert sorted(by_target["blocker"]) == ["Odoo API access", "Store accounts missing"]
    assert by_target["relation"] == ["Login before check-in"]
    assert "Timeline is tight" not in [c.title for c in changes]  # a risk is not work


def test_a_task_finds_its_phase_by_anchor_not_by_arrival_order():
    """The ordering trap: findings written in one flush share a created_at, so a
    task can reach the mapper before its phase. The anchor is what actually says
    which section it came from."""
    changes = propose_changes(
        [
            _finding("phase", "Phase 0", anchor="Spec > Phase 0"),
            _finding("phase", "Phase 1", anchor="Spec > Phase 1"),
            # Arrives last, but belongs to Phase 0 by its anchor.
            _finding("task", "Set up CI", anchor="Spec > Phase 0 > Tasks"),
        ],
        "convert",
    )
    story = next(c for c in changes if c.target == "story")
    assert story.parent_temp_key == "epic:phase-0"
