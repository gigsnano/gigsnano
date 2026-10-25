"""GIN-434 Phase 0 — pure projection tests for the Project Journey.

No DB: `build_journey` is fed constructed Story rows. The key assertion is the
Phase 0 exit gate — a manually-DONE step is not VERIFIED without a finalized
artifact.
"""

from datetime import datetime, timezone

from gigsnano_api.features.journey.service import build_journey
from gigsnano_api.features.journey.schemas import EJourneyPhase, EStepState
from gigsnano_api.models import EStoryStatus, Story

_TS = datetime(2026, 7, 24, 12, 0, tzinfo=timezone.utc)


def _story(sid, workflow, *, status=EStoryStatus.TODO, locked=False, required=False,
           skipped=False, artifact=None, title=None):
    return Story(
        id=sid,
        title=title or workflow,
        description=f"purpose of {workflow}",
        bmad_workflow=workflow,
        bmad_artifact=artifact,
        bmad_is_locked=locked,
        bmad_is_required=required,
        bmad_skipped=skipped,
        status=status,
        updated_at=_TS,
    )


def _by_id(journey):
    return {s.id: s for s in journey.steps}


def test_phase_and_surface_mapping():
    stories = [
        _story("s_prd", "bmad-prd"),
        _story("s_ux", "bmad-ux"),
        _story("s_arch", "bmad-create-architecture"),
        _story("s_epics", "bmad-create-epics-and-stories"),
        _story("s_sprint", "bmad-sprint-planning"),
    ]
    steps = _by_id(build_journey("p1", True, stories, set(), {}))
    assert steps["s_prd"].phase == EJourneyPhase.DEFINE
    assert steps["s_ux"].phase == EJourneyPhase.EXPERIENCE
    assert steps["s_ux"].surface == "experience"
    assert steps["s_arch"].phase == EJourneyPhase.ENGINEER
    assert steps["s_arch"].surface == "topology"
    assert steps["s_epics"].surface == "delivery"
    assert steps["s_sprint"].phase == EJourneyPhase.DELIVER
    assert steps["s_prd"].surface is None


def test_state_derivation():
    stories = [
        _story("a", "track-selection", status=EStoryStatus.TODO),
        _story("b", "bmad-prd", status=EStoryStatus.IN_PROGRESS),
        _story("c", "bmad-ux", locked=True),
        _story("d", "bmad-research", skipped=True),
    ]
    steps = _by_id(build_journey("p1", True, stories, set(), {}))
    assert steps["a"].state == EStepState.READY
    assert steps["b"].state == EStepState.IN_PROGRESS
    assert steps["c"].state == EStepState.BLOCKED
    assert steps["d"].state == EStepState.SKIPPED


def test_done_without_artifact_is_not_verified():
    """Phase 0 exit gate: a manual drag-to-Done cannot verify a step."""
    story = _story("s_prd", "bmad-prd", status=EStoryStatus.DONE)
    steps = _by_id(build_journey("p1", True, [story], set(), {}))
    assert steps["s_prd"].state == EStepState.REVIEW_REQUIRED
    assert steps["s_prd"].output is None

    # With a finalized artifact it flips to VERIFIED.
    verified = _by_id(
        build_journey("p1", True, [story], {"s_prd"}, {"s_prd": ("prd", 2)})
    )
    assert verified["s_prd"].state == EStepState.VERIFIED
    assert verified["s_prd"].output.type == "prd"
    assert verified["s_prd"].output.version == 2
    assert verified["s_prd"].output.verified is True


def test_done_decision_step_is_verified_without_artifact():
    """Decision-only steps (track/scope/cleanup) produce no document artifact —
    DONE is their completion, so they verify without one (unlike document steps)."""
    story = _story("s_track", "track-selection", status=EStoryStatus.DONE, required=True)
    steps = _by_id(build_journey("p1", True, [story], set(), {}))
    assert steps["s_track"].state == EStepState.VERIFIED


def test_prerequisites_resolve_to_story_ids():
    stories = [_story("s_prd", "bmad-prd"), _story("s_arch", "bmad-create-architecture")]
    steps = _by_id(build_journey("p1", True, stories, set(), {}))
    # architecture prereqs include bmad-prd (present) and bmad-ux (absent → dropped)
    assert steps["s_arch"].prerequisites == ["s_prd"]
    assert steps["s_prd"].prerequisites == []


def test_ux_not_applicable_without_ui():
    stories = [_story("s_ux", "bmad-ux")]
    steps = _by_id(build_journey("p1", False, stories, set(), {}))
    assert steps["s_ux"].applicable is False
    # required flag drives skippable
    assert steps["s_ux"].skippable is True
