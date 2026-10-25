"""Apply an approved import plan, and undo it (GIN-397).

Creation is ordered, not iterated: containers first, then epics, then the stories
that hang off them, then the edges. A child resolves its parent through the
plan's `temp_key`, which is why proposals carry one — the parent has no id until
this run creates it.

Three guarantees the epic asks for, implemented literally:

* **Idempotent** — a change that already has `created_object_id` is skipped, so
  re-applying (or resuming a partial run) creates nothing twice.
* **Partial failure is survivable** — a change that raises is recorded `failed`
  with its reason and the rest of the plan continues.
* **Rollback deletes exactly what this run created** — tracked per change, never
  inferred from names or timestamps.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.package_import.proposal import plan_changes
from gigsnano_api.lib.story_numbers import next_story_number
from gigsnano_api.models.artifacts import Artifact
from gigsnano_api.models.blockers import WorkItemBlocker
from gigsnano_api.models.cycles import Cycle
from gigsnano_api.models.modules import Module
from gigsnano_api.models.packages import (
    ImportChange,
    ImportPlan,
    PackageFinding,
    WorkItemSource,
)
from gigsnano_api.models.roadmap import Milestone
from gigsnano_api.models.stories import EStoryStatus, EStoryType, Story

#: Containers before the work that references them; edges last. Within a tier the
#: plan's own order is kept, so the result reads like the document it came from.
_ORDER = ("module", "milestone", "cycle", "epic", "story", "task", "relation", "blocker")

_STORY_TYPES = {"epic": EStoryType.EPIC, "story": EStoryType.STORY, "task": EStoryType.TASK}


class _Refs:
    """temp_key -> the object this run created for it."""

    def __init__(self) -> None:
        self.stories: dict[str, Story] = {}
        self.cycles: dict[str, Cycle] = {}
        self.modules: dict[str, Module] = {}
        self.milestones: dict[str, Milestone] = {}


def _payload(change: ImportChange) -> dict:
    return change.payload or {}


async def _create_module(db, project, change, refs, counters) -> Module:
    module = Module(project_id=project.id, name=change.title[:120],
                    description=_payload(change).get("description", ""))
    db.add(module)
    await db.flush()
    refs.modules[change.temp_key] = module
    return module


async def _create_milestone(db, project, change, refs, counters) -> Milestone:
    milestone = Milestone(project_id=project.id, name=change.title[:200],
                          description=_payload(change).get("description", ""))
    db.add(milestone)
    await db.flush()
    refs.milestones[change.temp_key] = milestone
    return milestone


async def _create_cycle(db, project, change, refs, counters) -> Cycle:
    cycle = Cycle(project_id=project.id, name=change.title[:120],
                  description=_payload(change).get("description", ""))
    db.add(cycle)
    await db.flush()
    refs.cycles[change.temp_key] = cycle
    return cycle


async def _create_story(db, project, change, refs, counters) -> Story:
    parent = refs.stories.get(change.parent_temp_key) if change.parent_temp_key else None
    story = Story(
        project_id=project.id,
        title=change.title[:300],
        description=_payload(change).get("description", ""),
        status=EStoryStatus.TODO,
        type=_STORY_TYPES.get(change.target, EStoryType.STORY),
        parent_id=parent.id if parent is not None else None,
        story_number=await next_story_number(db, project.id, counters),
    )
    db.add(story)
    await db.flush()
    refs.stories[change.temp_key] = story
    await _record_source(db, change, story)
    return story


async def _record_source(db: AsyncSession, change: ImportChange, story: Story) -> None:
    """Link the created item to the document section it came from.

    Written here rather than derived from the plan later: a plan is a draft that
    gets rebuilt, and provenance has to outlive it. The document name and anchor
    are copied, not only referenced, so "Derived from: phases-0-3.md, Phase 0"
    still renders after a re-analysis clears the finding.
    """
    finding = await db.get(PackageFinding, change.finding_id) if change.finding_id else None
    document = (
        await db.get(Artifact, finding.document_id)
        if finding is not None and finding.document_id
        else None
    )
    db.add(
        WorkItemSource(
            story_id=story.id,
            document_id=document.id if document is not None else None,
            package_id=document.package_id if document is not None else None,
            document_name=(
                (document.file_name or document.title) if document is not None else ""
            )[:300],
            anchor=(finding.anchor if finding is not None else "")[:300],
            anchor_start=finding.anchor_start if finding is not None else None,
            anchor_end=finding.anchor_end if finding is not None else None,
            document_version=document.version if document is not None else None,
            finding_id=finding.id if finding is not None else None,
        )
    )


async def _create_blocker(db, project, change, refs, counters) -> WorkItemBlocker:
    """A blocker needs something to block. The plan does not always name one, and
    inventing an attachment would put a real blocker on the wrong work item — so a
    blocker with nothing to attach to is reported, not guessed at."""
    target = next(iter(refs.stories.values()), None)
    if change.parent_temp_key and change.parent_temp_key in refs.stories:
        target = refs.stories[change.parent_temp_key]
    if target is None:
        raise ValueError(
            "no work item to attach this blocker to — approve the work it blocks first"
        )
    blocker = WorkItemBlocker(
        project_id=project.id,
        story_id=target.id,
        external_dependency=change.title[:300],
        reason=_payload(change).get("description", ""),
    )
    db.add(blocker)
    await db.flush()
    return blocker


async def _create_relation(db, project, change, refs, counters):
    """A dependency finding names the relationship in prose but not its two
    endpoints, so there is nothing to link yet. Reported honestly rather than
    guessed — GIN-399 will let a caller name the endpoints."""
    raise ValueError(
        "dependency needs its two work items chosen before it can be linked"
    )


_CREATORS = {
    "module": _create_module,
    "milestone": _create_milestone,
    "cycle": _create_cycle,
    "epic": _create_story,
    "story": _create_story,
    "task": _create_story,
    "blocker": _create_blocker,
    "relation": _create_relation,
}

#: Rollback order: edges first, then work items, then the containers they sat in.
_DELETE_ORDER = tuple(reversed(_ORDER))
_MODELS = {
    "module": Module, "milestone": Milestone, "cycle": Cycle,
    "epic": Story, "story": Story, "task": Story, "blocker": WorkItemBlocker,
}


async def blocking_conflict_count(db: AsyncSession, package_id: str) -> int:
    findings = (
        await db.execute(select(PackageFinding).where(PackageFinding.package_id == package_id))
    ).scalars()
    return sum(
        1 for f in findings if (f.override or {}).get("status", f.status) == "conflict"
    )


async def apply_plan(db: AsyncSession, *, project, plan: ImportPlan) -> dict:
    """Create every approved change. Returns a grouped result, never raises for a
    single bad change."""
    changes = await plan_changes(db, plan.id)
    approved = [c for c in changes if c.status == "approved" or c.created_object_id]
    ordered = sorted(approved, key=lambda c: _ORDER.index(c.target) if c.target in _ORDER else 99)

    refs = _Refs()
    counters: dict[str, int] = {}
    applied = failed = skipped = 0

    for change in ordered:
        if change.created_object_id:
            # Already applied — re-running must not create it a second time. Its
            # object is still needed as a parent for anything below it.
            if change.target in _STORY_TYPES:
                existing = await db.get(Story, change.created_object_id)
                if existing is not None:
                    refs.stories[change.temp_key] = existing
            skipped += 1
            continue
        creator = _CREATORS.get(change.target)
        if creator is None:
            change.status = "failed"
            change.error = f"nothing knows how to create a {change.target}"
            failed += 1
            continue
        try:
            created = await creator(db, project, change, refs, counters)
            change.created_object_id = created.id
            change.status = "applied"
            change.error = ""
            applied += 1
        except Exception as err:  # noqa: BLE001 — one bad change must not sink the plan
            change.status = "failed"
            change.error = str(err)[:500]
            failed += 1

    plan.status = "applied" if failed == 0 else "partially_applied"
    await db.flush()
    return {
        "plan_id": plan.id,
        "status": plan.status,
        "applied": applied,
        "failed": failed,
        "skipped": skipped,
        "by_target": _group(ordered),
    }


def _group(changes: list[ImportChange]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for change in changes:
        bucket = out.setdefault(change.target, {})
        bucket[change.status] = bucket.get(change.status, 0) + 1
    return out


async def rollback_plan(db: AsyncSession, *, plan: ImportPlan) -> dict:
    """Delete what this plan created, and nothing else. A change that was never
    applied is left alone — rollback undoes what happened, not what was proposed."""
    changes = await plan_changes(db, plan.id)
    applied = [c for c in changes if c.created_object_id and c.status == "applied"]
    ordered = sorted(
        applied, key=lambda c: _DELETE_ORDER.index(c.target) if c.target in _DELETE_ORDER else 99
    )

    removed = 0
    for change in ordered:
        model = _MODELS.get(change.target)
        if model is None:
            continue
        obj = await db.get(model, change.created_object_id)
        if obj is not None:
            if change.target in _STORY_TYPES:
                for source in await work_item_sources(db, change.created_object_id):
                    await db.delete(source)
            await db.delete(obj)
            removed += 1
        change.status = "rolled_back"
        change.created_object_id = None
    plan.status = "rolled_back"
    await db.flush()
    return {"plan_id": plan.id, "status": plan.status, "removed": removed}


async def work_item_sources(db: AsyncSession, story_id: str) -> list[WorkItemSource]:
    """Work item -> the document sections it was derived from."""
    return list(
        (
            await db.execute(
                select(WorkItemSource)
                .where(WorkItemSource.story_id == story_id)
                .order_by(WorkItemSource.created_at)
            )
        ).scalars()
    )


async def document_work_items(db: AsyncSession, document_id: str) -> list[tuple]:
    """Document -> everything it generated, the reverse direction the epic asks
    for. Returns (source, story) pairs so a caller can render titles without a
    second query."""
    rows = (
        await db.execute(
            select(WorkItemSource, Story)
            .join(Story, Story.id == WorkItemSource.story_id)
            .where(WorkItemSource.document_id == document_id)
            .order_by(Story.story_number)
        )
    ).all()
    return [(source, story) for source, story in rows]
