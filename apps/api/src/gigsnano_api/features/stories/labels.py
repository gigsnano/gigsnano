"""Work-item labels — many-to-many (GIN-475).

`story_labels` is the only source of truth. Everything that reads or writes a
story's labels goes through here so there is one place that owns de-duplication,
project scoping, and the set-replacement semantics; callers never touch the
association rows directly.
"""

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Project, ProjectLabel, StoryLabel

__all__ = [
    "get_story_label_ids",
    "label_names",
    "load_story_label_ids",
    "normalize_label_ids",
    "set_story_labels",
    "validate_label_ids",
]


def normalize_label_ids(label_ids: list[str] | None) -> list[str]:
    """Drop blanks and duplicates, preserving the caller's order. A client sending
    the same id twice is expressing "this label is on the item", not an error."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in label_ids or []:
        label_id = (raw or "").strip()
        if not label_id or label_id in seen:
            continue
        seen.add(label_id)
        out.append(label_id)
    return out


async def validate_label_ids(
    db: AsyncSession, project: Project, label_ids: list[str]
) -> list[str]:
    """Every id must be a label of THIS project. Returns the normalized list.
    Raises 400 naming the offender — an agent or integration sending a label from
    another project needs to know which one, not just that something was wrong."""
    ids = normalize_label_ids(label_ids)
    if not ids:
        return []
    rows = (
        await db.execute(
            select(ProjectLabel.id).where(
                ProjectLabel.id.in_(ids), ProjectLabel.project_id == project.id
            )
        )
    ).scalars().all()
    missing = [i for i in ids if i not in set(rows)]
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Label(s) not in this project: {', '.join(missing)}",
        )
    return ids


async def load_story_label_ids(
    db: AsyncSession, story_ids: list[str]
) -> dict[str, list[str]]:
    """story_id → its label ids, ordered by label name. One query for the whole
    page (the `sub_issue_counts` / `load_custom_values` pattern) so serializing a
    list of stories never turns into N+1."""
    if not story_ids:
        return {}
    rows = (
        await db.execute(
            select(StoryLabel.story_id, StoryLabel.label_id)
            .join(ProjectLabel, ProjectLabel.id == StoryLabel.label_id)
            .where(StoryLabel.story_id.in_(story_ids))
            .order_by(ProjectLabel.name)
        )
    ).all()
    out: dict[str, list[str]] = {}
    for story_id, label_id in rows:
        out.setdefault(story_id, []).append(label_id)
    return out


async def get_story_label_ids(db: AsyncSession, story_id: str) -> list[str]:
    return (await load_story_label_ids(db, [story_id])).get(story_id, [])


async def set_story_labels(
    db: AsyncSession, story_id: str, label_ids: list[str]
) -> tuple[list[str], list[str]] | None:
    """Replace a story's labels with exactly `label_ids` (already validated).

    Returns (old_ids, new_ids) when the set actually changed, else None — so the
    caller only writes a history row for a real change. Adds and removes are
    applied as a diff rather than delete-all-then-insert: a concurrent request
    touching a different label then can't lose it to a blanket delete.
    """
    current = await get_story_label_ids(db, story_id)
    if set(current) == set(label_ids):
        return None
    removed = set(current) - set(label_ids)
    added = [i for i in label_ids if i not in set(current)]
    if removed:
        await db.execute(
            delete(StoryLabel).where(
                StoryLabel.story_id == story_id, StoryLabel.label_id.in_(removed)
            )
        )
    for label_id in added:
        db.add(StoryLabel(story_id=story_id, label_id=label_id))
    await db.flush()
    return current, label_ids


async def label_names(db: AsyncSession, label_ids: list[str]) -> str:
    """Comma-joined label names for an activity/history row — ids mean nothing to
    a human reading the feed."""
    if not label_ids:
        return ""
    rows = (
        await db.execute(
            select(ProjectLabel.name)
            .where(ProjectLabel.id.in_(label_ids))
            .order_by(ProjectLabel.name)
        )
    ).scalars().all()
    return ", ".join(rows)
