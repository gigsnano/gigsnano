"""Delivery plan projection (GIN-429).

Projects the real Epic→Story→Task tree (created by the bmad-create-epics-and-
stories finalize, `bmad/epic_tree.py`) into the FE `IDeliveryPlan`. Read-only,
no new schema. The FE computes readiness/coverage/first-cycle from this tree.
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.models import Cycle, ECycleStatus, EStoryType, Project, Story

from .schemas import DeliveryPlanOut, PlanEpicOut, PlanStoryOut, PlanTaskOut

_TAG_RE = re.compile(r"<[^>]+>")


def _outcome(description: str | None) -> str:
    """A short plain-text outcome line from the story description."""
    text = _TAG_RE.sub(" ", description or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:160]


def build_delivery_plan(
    epics: list[Story],
    children_by_parent: dict[str, list[Story]],
    owner_by_id: dict[str, str],
) -> DeliveryPlanOut:
    """Pure assembly of the Epic→Story→Task tree, ordered by sort_order."""
    def owner(story: Story) -> str | None:
        return owner_by_id.get(story.assignee_id) if story.assignee_id else None

    return DeliveryPlanOut(
        epics=[
            PlanEpicOut(
                id=epic.id,
                title=epic.title,
                stories=[
                    PlanStoryOut(
                        id=story.id,
                        title=story.title,
                        outcome=_outcome(story.description),
                        tasks=[
                            PlanTaskOut(id=task.id, title=task.title, owner=owner(task))
                            for task in children_by_parent.get(story.id, [])
                        ],
                    )
                    for story in children_by_parent.get(epic.id, [])
                ],
            )
            for epic in epics
        ]
    )


async def get_delivery_plan(db: AsyncSession, project: Project) -> DeliveryPlanOut:
    # All product work-item rows (epics/stories/tasks) — the epic tree. Sprint-0
    # BMAD cards are type STORY/FEATURE *with* bmad_workflow; the tree's rows have
    # bmad_workflow NULL, so type EPIC/STORY/TASK + no workflow isolates them.
    rows = list(
        (
            await db.execute(
                select(Story)
                .where(
                    Story.project_id == project.id,
                    Story.bmad_workflow.is_(None),
                    Story.type.in_((EStoryType.EPIC, EStoryType.STORY, EStoryType.TASK)),
                )
                .order_by(Story.sort_order)
            )
        ).scalars().all()
    )

    epics = [s for s in rows if s.type == EStoryType.EPIC]
    children_by_parent: dict[str, list[Story]] = {}
    for s in rows:
        if s.parent_id:
            children_by_parent.setdefault(s.parent_id, []).append(s)

    owner_ids = {s.assignee_id for s in rows if s.assignee_id}
    owner_by_id: dict[str, str] = {}
    if owner_ids:
        users = (
            await db.execute(select(User).where(User.id.in_(owner_ids)))
        ).scalars().all()
        owner_by_id = {u.id: (u.display_name or u.email) for u in users}

    return build_delivery_plan(epics, children_by_parent, owner_by_id)


async def start_delivery(
    db: AsyncSession, project: Project, title: str, story_ids: list[str]
) -> tuple[str, bool]:
    """Create (or reuse) the first delivery Cycle and move the picked stories into
    it. Idempotent on cycle name so a double 'Start delivery' can't duplicate.
    GIN-429 exit gate: 'create/confirm the cycle when Start Delivery is selected.'"""
    existing = (
        await db.execute(
            select(Cycle).where(
                Cycle.project_id == project.id,
                Cycle.name == title,
                Cycle.is_sprint_zero.is_(False),
            )
        )
    ).scalars().first()
    created = existing is None
    cycle = existing or Cycle(project_id=project.id, name=title, status=ECycleStatus.ACTIVE)
    if created:
        db.add(cycle)
        await db.flush()
    if story_ids:
        rows = (
            await db.execute(
                select(Story).where(
                    Story.project_id == project.id, Story.id.in_(story_ids)
                )
            )
        ).scalars().all()
        for s in rows:
            s.cycle_id = cycle.id
    await db.commit()
    return cycle.id, created


__all__ = ["build_delivery_plan", "get_delivery_plan", "start_delivery"]
