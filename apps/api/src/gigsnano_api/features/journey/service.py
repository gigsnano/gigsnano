"""Project Journey projection (GIN-434 Phase 0).

Projects Sprint-0 Story.bmad_* state 1:1 into the FE journey contract, grouped
into outcome phases. No journey table — the Story rows are the source of truth.
`build_journey` is pure (table-fed) for the test seam; `get_journey` does the
two reads it needs (Sprint-0 stories + which have a finalized artifact).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import (
    Artifact,
    Cycle,
    EArtifactStatus,
    EStoryStatus,
    Project,
    Story,
)

from .schemas import (
    EJourneyPhase,
    EStepState,
    JourneyOut,
    JourneyStepOut,
    JourneyStepOutput,
)

# Outcome phase per BMAD workflow. Steps not listed fall to DEFINE (the early
# analysis/track/scope steps of both flows).
_PHASE_BY_WORKFLOW: dict[str, EJourneyPhase] = {
    "bmad-ux": EJourneyPhase.EXPERIENCE,
    "bmad-create-architecture": EJourneyPhase.ENGINEER,
    "bmad-create-epics-and-stories": EJourneyPhase.PLAN,
    "bmad-check-implementation-readiness": EJourneyPhase.PLAN,
    "bmad-sprint-planning": EJourneyPhase.DELIVER,
}

# Specialized editing surface a step opens (drives the FE workspace CTA).
_SURFACE_BY_WORKFLOW: dict[str, str] = {
    "bmad-ux": "experience",
    "bmad-create-architecture": "topology",
    "bmad-create-epics-and-stories": "delivery",
}

# Prerequisite workflows for the "unlocks after" display, mirroring bmad/unlock.py.
# The authoritative lock is Story.bmad_is_locked (→ state BLOCKED); this is display.
_PREREQ_WORKFLOWS: dict[str, list[str]] = {
    "scope-selection": ["bmad-generate-project-context"],
    "bmad-brainstorming": ["track-selection"],
    "bmad-research": ["track-selection"],
    "bmad-product-brief": ["track-selection"],
    "bmad-prd": ["track-selection", "scope-selection"],
    "bmad-ux": ["bmad-prd"],
    "bmad-create-architecture": ["bmad-prd", "bmad-ux"],
    "bmad-create-epics-and-stories": ["bmad-prd", "bmad-create-architecture"],
    "bmad-check-implementation-readiness": ["bmad-create-epics-and-stories"],
    "bmad-sprint-planning": ["bmad-check-implementation-readiness"],
}

_STATUS_STATE = {
    EStoryStatus.TODO: EStepState.READY,
    EStoryStatus.IN_PROGRESS: EStepState.IN_PROGRESS,
    EStoryStatus.IN_REVIEW: EStepState.REVIEW_REQUIRED,
}

# Steps that record a decision, not a finalized document artifact. Being DONE is
# their completion — there is no output contract to verify against, so they must
# not be held at REVIEW_REQUIRED like a document step with a missing artifact.
_NO_ARTIFACT_STEPS = frozenset({"track-selection", "scope-selection", "cleanup-artifacts"})


def _step_state(story: Story, verified: bool) -> EStepState:
    if story.bmad_skipped:
        return EStepState.SKIPPED
    if story.bmad_is_locked:
        return EStepState.BLOCKED
    if story.status == EStoryStatus.DONE:
        # DONE gates on a finalized artifact — a manual drag-to-Done is NOT
        # verified (GIN-434 Phase 0 exit gate); it still needs its output.
        return EStepState.VERIFIED if verified else EStepState.REVIEW_REQUIRED
    return _STATUS_STATE.get(story.status, EStepState.READY)


def build_journey(
    project_id: str,
    has_ui: bool,
    stories: list[Story],
    verified_ids: set[str],
    artifact_by_story: dict[str, tuple[str, int]],
) -> JourneyOut:
    """Pure projection. `artifact_by_story`: story_id -> (doc_type, version) of
    its latest finalized artifact. `verified_ids`: stories with such an artifact."""
    id_by_workflow = {s.bmad_workflow: s.id for s in stories if s.bmad_workflow}
    steps: list[JourneyStepOut] = []
    for story in stories:
        wf = story.bmad_workflow or ""
        verified = story.id in verified_ids or (
            story.status == EStoryStatus.DONE and wf in _NO_ARTIFACT_STEPS
        )
        applicable = has_ui or wf != "bmad-ux"
        art = artifact_by_story.get(story.id)
        output = (
            JourneyStepOutput(
                label=story.bmad_artifact or art[0], type=art[0], version=art[1], verified=True
            )
            if art
            else None
        )
        prereqs = [
            id_by_workflow[p] for p in _PREREQ_WORKFLOWS.get(wf, []) if p in id_by_workflow
        ]
        steps.append(
            JourneyStepOut(
                id=story.id,
                phase=_PHASE_BY_WORKFLOW.get(wf, EJourneyPhase.DEFINE),
                title=story.title,
                purpose=story.description or "",
                state=_step_state(story, verified),
                applicable=applicable,
                prerequisites=prereqs,
                skippable=not story.bmad_is_required,
                output=output,
                surface=_SURFACE_BY_WORKFLOW.get(wf),
                updated_at=story.updated_at.isoformat(),
            )
        )
    return JourneyOut(id=f"journey_{project_id}", project_id=project_id, steps=steps)


async def get_journey(db: AsyncSession, project: Project) -> JourneyOut:
    sprint0 = (
        await db.execute(
            select(Cycle).where(Cycle.project_id == project.id, Cycle.is_sprint_zero.is_(True))
        )
    ).scalar_one_or_none()
    if sprint0 is None:
        return JourneyOut(id=f"journey_{project.id}", project_id=project.id, steps=[])

    stories = list(
        (
            await db.execute(
                select(Story)
                .where(Story.cycle_id == sprint0.id, Story.bmad_workflow.is_not(None))
                .order_by(Story.sort_order)
            )
        ).scalars().all()
    )
    story_ids = [s.id for s in stories]

    # Latest finalized artifact per source story — the verification signal.
    artifact_by_story: dict[str, tuple[str, int]] = {}
    if story_ids:
        rows = (
            await db.execute(
                select(Artifact)
                .where(
                    Artifact.source_story_id.in_(story_ids),
                    Artifact.status == EArtifactStatus.FINAL,
                )
                .order_by(Artifact.version)
            )
        ).scalars().all()
        for a in rows:  # ordered by version asc → last write wins = latest
            artifact_by_story[a.source_story_id] = (a.doc_type, a.version)

    return build_journey(
        project.id,
        project.has_ui,
        stories,
        set(artifact_by_story),
        artifact_by_story,
    )


__all__ = ["build_journey", "get_journey"]
