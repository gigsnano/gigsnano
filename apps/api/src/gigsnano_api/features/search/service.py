"""Per-entity search queries for GIN-35 unified search (Plane `GlobalSearchEndpoint`
parity). Every query is scoped to the workspace and, via the caller-supplied
`ids` (an `accessible_project_ids` result — `None` = all, `[]`/list = restricted),
to the projects the requester may see. Callers (the router) resolve `ids` once
per request and pass it to each function below.
"""
import re

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Cycle, Module, Page, Project, ProjectView, Story

# ponytail: fixed per-entity cap, no pagination — add offset/limit params if the
# search UI ever needs more than a first page of results per group.
_LIMIT = 20


def _ilike(col, term: str):
    return col.ilike(f"%{term}%")


async def search_projects(
    db: AsyncSession, workspace_id: str, q: str | None, ids: list[str] | None
) -> list[Project]:
    stmt = select(Project).where(Project.workspace_id == workspace_id)
    if ids is not None:
        stmt = stmt.where(Project.id.in_(ids))
    if q and q.strip():
        term = q.strip()
        stmt = stmt.where(or_(_ilike(Project.name, term), _ilike(Project.identifier, term)))
    stmt = stmt.order_by(Project.created_at.desc()).limit(_LIMIT)
    return list((await db.execute(stmt)).scalars().all())


def _work_item_clause(q: str | None):
    if not q or not q.strip():
        return None
    term = q.strip()
    clauses = [Story.title.ilike(f"%{term}%"), Story.description.ilike(f"%{term}%")]
    # Plane parity: whole-integer tokens in the query also match the work item's
    # human-facing sequence number (story_number).
    for sequence in re.findall(r"\b\d+\b", term):
        clauses.append(Story.story_number == int(sequence))
    return or_(*clauses)


async def search_work_items(
    db: AsyncSession, workspace_id: str, q: str | None, ids: list[str] | None
) -> list[Story]:
    stmt = (
        select(Story)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == workspace_id)
    )
    if ids is not None:
        stmt = stmt.where(Story.project_id.in_(ids))
    clause = _work_item_clause(q)
    if clause is not None:
        stmt = stmt.where(clause)
    stmt = stmt.order_by(Story.created_at.desc()).limit(_LIMIT)
    return list((await db.execute(stmt)).scalars().all())


async def search_cycles(
    db: AsyncSession, workspace_id: str, q: str | None, ids: list[str] | None
) -> list[Cycle]:
    stmt = (
        select(Cycle)
        .join(Project, Project.id == Cycle.project_id)
        .where(Project.workspace_id == workspace_id)
    )
    if ids is not None:
        stmt = stmt.where(Cycle.project_id.in_(ids))
    if q and q.strip():
        stmt = stmt.where(_ilike(Cycle.name, q.strip()))
    stmt = stmt.order_by(Cycle.created_at.desc()).limit(_LIMIT)
    return list((await db.execute(stmt)).scalars().all())


async def search_modules(
    db: AsyncSession, workspace_id: str, q: str | None, ids: list[str] | None
) -> list[Module]:
    stmt = (
        select(Module)
        .join(Project, Project.id == Module.project_id)
        .where(Project.workspace_id == workspace_id)
    )
    if ids is not None:
        stmt = stmt.where(Module.project_id.in_(ids))
    if q and q.strip():
        stmt = stmt.where(_ilike(Module.name, q.strip()))
    stmt = stmt.order_by(Module.created_at.desc()).limit(_LIMIT)
    return list((await db.execute(stmt)).scalars().all())


async def search_views(
    db: AsyncSession, workspace_id: str, q: str | None, ids: list[str] | None
) -> list[ProjectView]:
    stmt = (
        select(ProjectView)
        .join(Project, Project.id == ProjectView.project_id)
        .where(Project.workspace_id == workspace_id)
    )
    if ids is not None:
        stmt = stmt.where(ProjectView.project_id.in_(ids))
    if q and q.strip():
        stmt = stmt.where(_ilike(ProjectView.name, q.strip()))
    stmt = stmt.order_by(ProjectView.created_at.desc()).limit(_LIMIT)
    return list((await db.execute(stmt)).scalars().all())


async def search_pages(
    db: AsyncSession, workspace_id: str, q: str | None, ids: list[str] | None
) -> list[Page]:
    stmt = (
        select(Page)
        .join(Project, Project.id == Page.project_id)
        .where(Project.workspace_id == workspace_id)
    )
    if ids is not None:
        stmt = stmt.where(Page.project_id.in_(ids))
    if q and q.strip():
        stmt = stmt.where(_ilike(Page.title, q.strip()))
    stmt = stmt.order_by(Page.created_at.desc()).limit(_LIMIT)
    return list((await db.execute(stmt)).scalars().all())
