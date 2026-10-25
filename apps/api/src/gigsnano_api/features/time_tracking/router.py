"""Workspace-level time-tracking reports (GIN-58 by person / GIN-59 by work item).

One enriched cross-story feed; the frontend groups it by person or by work item.
Scoped to the caller's accessible projects.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import Project, Story, TimeEntry
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
)

router = APIRouter(tags=["time-tracking"])

_W = "/workspaces/{workspace_slug}"


class TimeReportEntryOut(BaseModel):
    id: str
    hours: float
    note: str
    created_at: datetime
    user_id: str | None
    user_name: str
    user_avatar_url: str | None
    story_id: str
    story_title: str
    story_code: str
    project_id: str
    project_name: str


@router.get(f"{_W}/time-entries/", response_model=list[TimeReportEntryOut])
async def workspace_time_entries(
    user_id: str | None = None,
    story_id: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    ids = await accessible_project_ids(db, ctx)
    stmt = (
        select(TimeEntry, Story, Project)
        .join(Story, Story.id == TimeEntry.story_id)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id)
        .order_by(TimeEntry.created_at.desc())
    )
    if ids is not None:
        stmt = stmt.where(Story.project_id.in_(ids))
    if user_id:
        stmt = stmt.where(TimeEntry.user_id == user_id)
    if story_id:
        stmt = stmt.where(TimeEntry.story_id == story_id)

    rows = (await db.execute(stmt)).all()
    return [
        TimeReportEntryOut(
            id=entry.id,
            hours=entry.hours,
            note=entry.note,
            created_at=entry.created_at,
            user_id=entry.user_id,
            user_name=entry.user_name,
            user_avatar_url=entry.user_avatar_url,
            story_id=story.id,
            story_title=story.title,
            story_code=f"{project.identifier}-{story.story_number}",
            project_id=project.id,
            project_name=project.name,
        )
        for entry, story, project in rows
    ]
