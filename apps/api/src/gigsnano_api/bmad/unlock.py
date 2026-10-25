"""BMAD Sprint-0 unlock engine — port of the frontend's src/lib/bmad-unlock.ts.

Operates on Story ORM objects; mutates bmad_is_locked / bmad_skipped in memory
(callers persist). Rules source: docs/base-guides/bmad-workflow-guide.md §6.
"""

import math

from gigsnano_api.models import EReadinessResult, EStoryStatus, Story

_ANALYSIS = ("bmad-brainstorming", "bmad-research", "bmad-product-brief")


def js_round(x: float) -> int:
    """JavaScript Math.round (half-up) — Python's round() is banker's rounding."""
    return math.floor(x + 0.5)


def is_story_satisfied(story: Story) -> bool:
    """Done or explicitly skipped."""
    return story.status == EStoryStatus.DONE or story.bmad_skipped is True


def _find(stories: list[Story], workflow: str) -> Story | None:
    return next((s for s in stories if s.bmad_workflow == workflow), None)


def _satisfied(stories: list[Story], workflow: str) -> bool:
    story = _find(stories, workflow)
    return is_story_satisfied(story) if story is not None else False


def can_unlock_story(story: Story, stories: list[Story], has_ui: bool) -> bool:
    if story.bmad_workflow is None:
        return True
    w = story.bmad_workflow

    if w in ("track-selection", "cleanup-artifacts"):
        return True
    if w == "scope-selection":
        return _satisfied(stories, "bmad-generate-project-context")
    if w in _ANALYSIS:
        return _satisfied(stories, "track-selection") or _satisfied(stories, "scope-selection")
    if w in ("bmad-document-project", "bmad-generate-project-context"):
        return True  # brownfield entry steps are always available
    if w == "bmad-prd":
        return _satisfied(stories, "track-selection") or _satisfied(stories, "scope-selection")
    if w == "bmad-ux":
        return has_ui and _satisfied(stories, "bmad-prd")
    if w == "bmad-create-architecture":
        if not _satisfied(stories, "bmad-prd"):
            return False
        if has_ui:
            ux = _find(stories, "bmad-ux")
            if ux is not None and not is_story_satisfied(ux):
                return False
        return True
    if w == "bmad-create-epics-and-stories":
        return _satisfied(stories, "bmad-prd") and _satisfied(
            stories, "bmad-create-architecture"
        )
    if w == "bmad-check-implementation-readiness":
        return _satisfied(stories, "bmad-create-epics-and-stories")
    if w == "bmad-sprint-planning":
        gate = _find(stories, "bmad-check-implementation-readiness")
        return (
            gate is not None
            and gate.status == EStoryStatus.DONE
            and gate.bmad_readiness_result == EReadinessResult.PASS
        )
    return True


def apply_story_locks(stories: list[Story], has_ui: bool) -> None:
    """Recompute bmad_is_locked for every Sprint-0 story from the dependency rules."""
    for story in stories:
        if story.bmad_workflow is None:
            continue
        if story.bmad_workflow == "bmad-ux" and not has_ui:
            story.bmad_skipped = True
            story.bmad_is_locked = True
            continue
        story.bmad_is_locked = not can_unlock_story(story, stories, has_ui)


def rollup_progress(stories: list[Story]) -> int:
    """0–100 completion across Sprint-0 stories (skipped UX excluded)."""
    relevant = [
        s for s in stories if not (s.bmad_workflow == "bmad-ux" and s.bmad_skipped)
    ]
    if not relevant:
        return 0
    done = sum(1 for s in relevant if s.status == EStoryStatus.DONE)
    return js_round(done / len(relevant) * 100)


def sprint_zero_status(stories: list[Story]) -> str:
    """Derived ESprintZeroStatus value for IProject serialization."""
    if not stories:
        return "not_started"
    if rollup_progress(stories) == 100:
        return "complete"
    touched = any(
        s.status != EStoryStatus.TODO or s.bmad_skipped for s in stories
    )
    return "in_progress" if touched else "not_started"
