from gigsnano_api.bmad.blueprint import steps_for
from gigsnano_api.bmad.unlock import (
    apply_story_locks,
    can_unlock_story,  # noqa: F401 — part of the module's public interface under test
    is_story_satisfied,
    js_round,
    rollup_progress,
    sprint_zero_status,
)
from gigsnano_api.models import EProjectFlow, EReadinessResult, EStoryStatus, Story


def make_stories(flow=EProjectFlow.FRESH, has_ui=True) -> list[Story]:
    return [
        Story(
            project_id="p1", title=step.title, sort_order=i,
            status=EStoryStatus.TODO, bmad_workflow=step.workflow,
            bmad_agent=step.agent, bmad_artifact=step.artifact,
            bmad_is_required=step.required, bmad_is_locked=True, bmad_skipped=False,
        )
        for i, step in enumerate(steps_for(flow, has_ui))
    ]


def by_workflow(stories, workflow) -> Story:
    return next(s for s in stories if s.bmad_workflow == workflow)


def satisfy(stories, *workflows):
    for w in workflows:
        by_workflow(stories, w).status = EStoryStatus.DONE


def test_js_round_is_half_up():
    assert js_round(0.5) == 1  # Python round(0.5) == 0 — must NOT be used
    assert js_round(2.5) == 3
    assert js_round(-0.4) == 0


def test_initial_locks_fresh():
    stories = make_stories()
    apply_story_locks(stories, has_ui=True)
    assert by_workflow(stories, "track-selection").bmad_is_locked is False
    assert by_workflow(stories, "bmad-prd").bmad_is_locked is True
    assert by_workflow(stories, "bmad-sprint-planning").bmad_is_locked is True


def test_prd_unlocks_after_track_selection():
    stories = make_stories()
    satisfy(stories, "track-selection")
    apply_story_locks(stories, has_ui=True)
    assert by_workflow(stories, "bmad-prd").bmad_is_locked is False
    assert by_workflow(stories, "bmad-brainstorming").bmad_is_locked is False


def test_architecture_needs_prd_and_unskipped_ux():
    stories = make_stories()
    satisfy(stories, "track-selection", "bmad-prd")
    apply_story_locks(stories, has_ui=True)
    # UX exists, not satisfied → architecture stays locked
    assert by_workflow(stories, "bmad-create-architecture").bmad_is_locked is True
    by_workflow(stories, "bmad-ux").bmad_skipped = True
    apply_story_locks(stories, has_ui=True)
    assert by_workflow(stories, "bmad-create-architecture").bmad_is_locked is False


def test_epics_need_both_prd_and_architecture():
    stories = make_stories(has_ui=False)
    satisfy(stories, "track-selection", "bmad-prd")
    apply_story_locks(stories, has_ui=False)
    assert by_workflow(stories, "bmad-create-epics-and-stories").bmad_is_locked is True
    satisfy(stories, "bmad-create-architecture")
    apply_story_locks(stories, has_ui=False)
    assert by_workflow(stories, "bmad-create-epics-and-stories").bmad_is_locked is False


def test_sprint_planning_requires_readiness_pass():
    stories = make_stories(has_ui=False)
    satisfy(stories, "track-selection", "bmad-prd", "bmad-create-architecture",
            "bmad-create-epics-and-stories")
    gate = by_workflow(stories, "bmad-check-implementation-readiness")
    gate.status = EStoryStatus.DONE
    gate.bmad_readiness_result = EReadinessResult.CONCERNS
    apply_story_locks(stories, has_ui=False)
    assert by_workflow(stories, "bmad-sprint-planning").bmad_is_locked is True
    gate.bmad_readiness_result = EReadinessResult.PASS
    apply_story_locks(stories, has_ui=False)
    assert by_workflow(stories, "bmad-sprint-planning").bmad_is_locked is False


def test_skipped_counts_as_satisfied():
    stories = make_stories()
    track = by_workflow(stories, "track-selection")
    track.bmad_skipped = True
    assert is_story_satisfied(track) is True


def test_brownfield_entry_stories_unlocked():
    stories = make_stories(flow=EProjectFlow.EXISTING)
    apply_story_locks(stories, has_ui=True)
    assert by_workflow(stories, "cleanup-artifacts").bmad_is_locked is False
    assert by_workflow(stories, "bmad-generate-project-context").bmad_is_locked is False
    assert by_workflow(stories, "scope-selection").bmad_is_locked is True


def test_rollup_and_status():
    stories = make_stories(has_ui=False)  # 9 stories
    assert rollup_progress(stories) == 0
    assert sprint_zero_status(stories) == "not_started"
    satisfy(stories, "track-selection")
    assert rollup_progress(stories) == js_round(100 / 9)
    assert sprint_zero_status(stories) == "in_progress"
    for s in stories:
        s.status = EStoryStatus.DONE
    assert rollup_progress(stories) == 100
    assert sprint_zero_status(stories) == "complete"
