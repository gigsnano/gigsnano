"""Readiness endpoints (GIN-384): one item, or the whole project's backlog.

The rules live in `readiness.py` and are pure; this module's only job is to load
the context they need — blocking relations, near-duplicate titles, whether the
project even wants estimates — and to keep the project-wide answer bounded.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.stories.readiness import (
    Assessment,
    Snapshot,
    assess,
    find_duplicate_titles,
    propose_repair,
)
from gigsnano_api.features.stories.service import _get_story_or_404
from gigsnano_api.models import (
    EBlockerStatus,
    EPlanningMethod,
    EStoryRelationType,
    EStoryStatus,
    Project,
    Story,
    StoryRelation,
    WorkItemBlocker,
)
from gigsnano_api.shared.context import get_project_or_404

router = APIRouter(tags=["stories"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"
#: One call must stay a readable answer, not a data dump.
MAX_AUDIT_ITEMS = 200


def _code(project: Project, story: Story) -> str:
    return f"{project.identifier}-{story.story_number}"


def _is_estimated(story: Story, method: EPlanningMethod) -> bool:
    """Estimated *by this project's own method* — an estimate-free project is not
    "missing estimates" (GIN-330)."""
    if method is EPlanningMethod.AUTOMATIC:
        return True
    if method is EPlanningMethod.SIMPLE:
        return story.size is not None
    if method is EPlanningMethod.TIME:
        return story.duration_minutes is not None
    return story.estimate_points is not None or story.estimate_id is not None


async def _blockers(db: AsyncSession, project: Project, stories: list[Story]) -> dict[str, list[str]]:
    """code -> codes of unfinished items blocking it, from the relation graph."""
    ids = {s.id for s in stories}
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(StoryRelation)
            .join(Story, Story.id == StoryRelation.story_id)
            .where(Story.project_id == project.id)
        )
    ).scalars().all()
    by_id = {s.id: s for s in (await db.execute(
        select(Story).where(Story.project_id == project.id)
    )).scalars().all()}
    out: dict[str, list[str]] = {}
    for rel in rows:
        # blocking: story blocks related; blocked_by: story is blocked by related.
        if rel.relation_type is EStoryRelationType.BLOCKING:
            blocker_id, blocked_id = rel.story_id, rel.related_story_id
        elif rel.relation_type is EStoryRelationType.BLOCKED_BY:
            blocker_id, blocked_id = rel.related_story_id, rel.story_id
        else:
            continue
        blocker, blocked = by_id.get(blocker_id), by_id.get(blocked_id)
        if blocker is None or blocked is None or blocked.id not in ids:
            continue
        if blocker.status is EStoryStatus.DONE:
            continue  # a finished blocker blocks nothing
        out.setdefault(_code(project, blocked), []).append(_code(project, blocker))

    # A first-class blocker (GIN-383) blocks too — often for a reason no relation
    # can express, like an external dependency. Both sources or the audit lies.
    open_blockers = (
        await db.execute(
            select(WorkItemBlocker).where(
                WorkItemBlocker.project_id == project.id,
                WorkItemBlocker.status == EBlockerStatus.OPEN,
            )
        )
    ).scalars().all()
    for row in open_blockers:
        blocked = by_id.get(row.story_id)
        if blocked is None or blocked.id not in ids:
            continue
        blocking = by_id.get(row.blocking_story_id) if row.blocking_story_id else None
        source = (
            _code(project, blocking) if blocking
            else (row.external_dependency or "an external dependency")
        )
        out.setdefault(_code(project, blocked), []).append(source)
    return out


def _snapshot(
    project: Project, story: Story, *, method: EPlanningMethod,
    blocked_by: list[str], duplicates: list[str],
) -> Snapshot:
    return Snapshot(
        code=_code(project, story),
        title=story.title,
        description=story.description,
        status=story.status.value,
        type=story.type.value,
        priority=story.priority.value if story.priority else None,
        assignee_id=story.assignee_id,
        parent_id=story.parent_id,
        module_id=story.module_id,
        cycle_id=story.cycle_id,
        start_date=story.start_date,
        target_date=story.target_date,
        estimated=_is_estimated(story, method),
        updated_at=story.updated_at,
        blocked_by=tuple(sorted(blocked_by)),
        duplicate_of=tuple(sorted(duplicates)),
        committed=story.cycle_id is not None
        or story.status in (EStoryStatus.IN_PROGRESS, EStoryStatus.IN_REVIEW),
    )


async def _assess_project(
    db: AsyncSession, project: Project, *, only: Story | None = None
) -> tuple[list[Assessment], int]:
    """Assess the project's items (or just one), with the cross-item context —
    blockers and near-duplicates — that a single row cannot see."""
    stories = list((await db.execute(
        select(Story).where(Story.project_id == project.id).order_by(Story.story_number)
    )).scalars().all())
    blockers = await _blockers(db, project, stories)
    dupes: dict[str, list[str]] = {}
    for a, b, _score in find_duplicate_titles(
        [(_code(project, s), s.title) for s in stories]
    ):
        dupes.setdefault(a, []).append(b)
        dupes.setdefault(b, []).append(a)

    now = datetime.now(timezone.utc)
    targets = [only] if only is not None else stories
    results = [
        assess(
            _snapshot(
                project, s, method=project.planning_method,
                blocked_by=blockers.get(_code(project, s), []),
                duplicates=dupes.get(_code(project, s), []),
            ),
            now=now,
        )
        for s in targets
    ]
    return results, len(stories)


@router.get(_P + "/stories/{story_id}/readiness/")
async def story_readiness(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """One item's readiness classification, failed rules and repair proposals."""
    story = await _get_story_or_404(db, project, story_id)
    results, _total = await _assess_project(db, project, only=story)
    assessment = results[0]
    return {**assessment.as_dict(), "proposed_repairs": propose_repair(assessment)}


@router.get(_P + "/readiness-audit/")
async def project_readiness_audit(
    readiness: str | None = None,
    limit: int = 50,
    offset: int = 0,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The whole backlog graded, with a per-classification tally so the caller can
    see the shape before paging into the detail."""
    results, total = await _assess_project(db, project)
    tally: dict[str, int] = {}
    for item in results:
        tally[item.readiness.value] = tally.get(item.readiness.value, 0) + 1
    if readiness:
        wanted = {r.strip() for r in readiness.split(",") if r.strip()}
        results = [r for r in results if r.readiness.value in wanted]
    # Worst first: the point of an audit is what to fix, not what is fine.
    results.sort(key=lambda a: a.score)
    window = results[max(offset, 0) : max(offset, 0) + max(1, min(limit, MAX_AUDIT_ITEMS))]
    return {
        "project_id": project.id,
        "work_items_total": total,
        "matched": len(results),
        "returned": len(window),
        "truncated": len(window) < len(results),
        "average_score": round(sum(a.score for a in results) / len(results)) if results else 100,
        "by_readiness": tally,
        "items": [a.as_dict() for a in window],
    }


@router.get(_P + "/duplicate-work-items/", status_code=status.HTTP_200_OK)
async def duplicate_work_items(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Near-identical titles, for a human to judge. A heuristic on purpose: it
    surfaces candidates, it never merges anything."""
    stories = list((await db.execute(
        select(Story).where(Story.project_id == project.id).order_by(Story.story_number)
    )).scalars().all())
    titles = {_code(project, s): s.title for s in stories}
    pairs = find_duplicate_titles(list(titles.items()))
    return {
        "pairs": [
            {"codes": [a, b], "similarity": score, "titles": [titles[a], titles[b]]}
            for a, b, score in pairs
        ],
        "count": len(pairs),
    }
