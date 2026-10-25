"""Action-item review + approval into work items (spec piece 2). Approve mirrors
Smart Intake's accept() → _insert_story seam (features/intake/service.py)."""
import html

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.meetings.schemas import ActionItemPatch
from gigsnano_api.features.notifications.router import is_active_project_member, notify
from gigsnano_api.features.stories.service import _insert_story, _story_notification_href
from gigsnano_api.models import ENotificationKind, EStoryType, Project, Workspace
from gigsnano_api.models.meetings import (
    ITEM_APPROVED,
    ITEM_DISMISSED,
    ITEM_PENDING,
    Meeting,
    MeetingActionItem,
)


async def list_items(db: AsyncSession, meeting: Meeting) -> list[MeetingActionItem]:
    rows = await db.execute(select(MeetingActionItem).where(MeetingActionItem.meeting_id == meeting.id)
                            .order_by(MeetingActionItem.position))
    return list(rows.scalars())


async def get_item(db: AsyncSession, meeting: Meeting, item_id: str) -> MeetingActionItem:
    item = await db.get(MeetingActionItem, item_id)
    if item is None or item.meeting_id != meeting.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action item not found")
    return item


def _require_pending(item: MeetingActionItem) -> None:
    if item.status != ITEM_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "This action item has already been decided")


async def update_item(db: AsyncSession, project: Project, item: MeetingActionItem,
                      patch: ActionItemPatch) -> MeetingActionItem:
    _require_pending(item)
    fields = patch.model_dump(exclude_unset=True)
    if fields.get("assignee_id") and not await is_active_project_member(db, project.id, fields["assignee_id"]):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assignee is not a member of this project")
    for key, value in fields.items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


def _description_html(item: MeetingActionItem, meeting: Meeting) -> str:
    parts = []
    if item.description.strip():
        parts.append(f"<p>{html.escape(item.description.strip())}</p>")
    if item.quote.strip():
        parts.append(f"<blockquote><p>{html.escape(item.quote.strip())}</p></blockquote>")
    parts.append(f"<p><em>From meeting: {html.escape(meeting.title)}</em></p>")
    return "".join(parts)


async def approve_item(db: AsyncSession, project: Project, actor: User, meeting: Meeting,
                       item: MeetingActionItem, *, commit: bool = True) -> MeetingActionItem:
    # Row-lock so two concurrent approves of the same item (single or bulk) can't
    # both pass _require_pending and each insert a story. with_for_update() is a
    # no-op on SQLite (tests) and takes a real row lock on Postgres.
    # populate_existing is required: the route already loaded this item into the
    # session, and without it SQLAlchemy returns that cached object with the
    # status it had before the lock was granted — so the pending check would
    # read stale data and the race would stay open.
    item = (await db.execute(
        select(MeetingActionItem).where(MeetingActionItem.id == item.id)
        .with_for_update().execution_options(populate_existing=True)
    )).scalar_one()
    _require_pending(item)
    assignee = item.assignee_id
    if assignee and not await is_active_project_member(db, project.id, assignee):
        assignee = None
    story = await _insert_story(db, project, actor, {
        "title": item.title, "description": _description_html(item, meeting),
        "type": EStoryType(item.type), "assignee_id": assignee, "target_date": item.target_date,
    })
    item.status, item.created_story_id = ITEM_APPROVED, story.id
    item.decided_by_id, item.decided_at = actor.id, utcnow()
    if assignee and assignee != actor.id:
        workspace = await db.get(Workspace, project.workspace_id)
        await notify(db, project.workspace_id, receiver_id=assignee, kind=ENotificationKind.ASSIGNMENT,
                     title=f"{actor.display_name} assigned you {story.title}",
                     href=_story_notification_href(workspace.slug, project.id, story),
                     triggered_by_id=actor.id, project_id=project.id)
    if commit:
        await db.commit()
        await db.refresh(item)
    return item


async def dismiss_item(db: AsyncSession, actor: User, item: MeetingActionItem) -> MeetingActionItem:
    _require_pending(item)
    item.status, item.decided_by_id, item.decided_at = ITEM_DISMISSED, actor.id, utcnow()
    await db.commit()
    await db.refresh(item)
    return item
