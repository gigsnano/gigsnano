from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.features.meetings import action_items, service
from gigsnano_api.features.meetings.links import parse_meeting_link
from gigsnano_api.features.meetings.notes import generate_notes
from gigsnano_api.features.meetings.schemas import (
    ActionItemOut,
    ActionItemPatch,
    BulkApproveRequest,
    CreateMeetingRequest,
    MeetingOut,
    TranscriptSegmentOut,
)
from gigsnano_api.meetings.provider import MeetingBotProvider, get_meeting_provider
from gigsnano_api.models import Project
from gigsnano_api.models.meetings import ITEM_PENDING, EMeetingStatus, Meeting
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["meetings"])
_P = "/workspaces/{workspace_slug}/projects/{project_id}/meetings"


async def get_meeting_or_404(meeting_id: str, project: Project = Depends(get_project_or_404),
                             db: AsyncSession = Depends(get_db)) -> Meeting:
    return await service.get_meeting(db, project, meeting_id)


async def _out(db: AsyncSession, meeting: Meeting) -> MeetingOut:
    return service.meeting_out(meeting, (await service.pending_counts(db, [meeting.id])).get(meeting.id, 0))


@router.post(f"{_P}/", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: CreateMeetingRequest,
                         project: Project = Depends(require_project_write_access),
                         ctx: WorkspaceContext = Depends(get_workspace_context),
                         db: AsyncSession = Depends(get_db),
                         provider: MeetingBotProvider | None = Depends(get_meeting_provider)):
    try:
        parsed = parse_meeting_link(payload.meeting_url)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported meeting link")
    if provider is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Meeting notetaker is not configured")
    meeting = await service.create_meeting(db, project, ctx.user, parsed=parsed,
                                           title=payload.title, provider=provider,
                                           bot_name=settings.meetings_bot_name)
    if meeting.status is EMeetingStatus.FAILED:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, meeting.failure_reason or service.SERVICE_DOWN)
    return service.meeting_out(meeting)


@router.get(f"{_P}/", response_model=list[MeetingOut])
async def list_meetings(project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)):
    meetings = await service.list_meetings(db, project)
    counts = await service.pending_counts(db, [m.id for m in meetings])
    return [service.meeting_out(m, counts.get(m.id, 0)) for m in meetings]


@router.get(f"{_P}/{{meeting_id}}/", response_model=MeetingOut)
async def get_meeting(meeting: Meeting = Depends(get_meeting_or_404), db: AsyncSession = Depends(get_db)):
    return await _out(db, meeting)


@router.get(f"{_P}/{{meeting_id}}/segments/", response_model=list[TranscriptSegmentOut])
async def list_segments(meeting: Meeting = Depends(get_meeting_or_404), db: AsyncSession = Depends(get_db)):
    return await service.list_segments(db, meeting.id)


@router.post(f"{_P}/{{meeting_id}}/stop/", response_model=MeetingOut)
async def stop_meeting(meeting_id: str, project: Project = Depends(require_project_write_access),
                       db: AsyncSession = Depends(get_db),
                       provider: MeetingBotProvider | None = Depends(get_meeting_provider)):
    meeting = await service.get_meeting(db, project, meeting_id)
    return await _out(db, await service.stop_meeting(db, meeting, provider))


@router.post(f"{_P}/{{meeting_id}}/notes/", response_model=MeetingOut)
async def regenerate_notes(meeting_id: str, project: Project = Depends(require_project_write_access),
                           db: AsyncSession = Depends(get_db),
                           llm: LLMProvider = Depends(get_llm_provider)):
    meeting = await service.get_meeting(db, project, meeting_id)
    if meeting.status is not EMeetingStatus.ENDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Notes are available once the meeting has ended")
    await generate_notes(db, meeting, llm)
    await db.commit()
    await db.refresh(meeting)
    return await _out(db, meeting)


@router.post(f"{_P}/{{meeting_id}}/action-items/approve/", response_model=list[ActionItemOut])
async def bulk_approve_action_items(meeting_id: str, payload: BulkApproveRequest,
                                    project: Project = Depends(require_project_write_access),
                                    ctx: WorkspaceContext = Depends(get_workspace_context),
                                    db: AsyncSession = Depends(get_db)):
    meeting = await service.get_meeting(db, project, meeting_id)
    by_id = {item.id: item for item in await action_items.list_items(db, meeting)}
    for item_id in payload.ids:
        item = by_id.get(item_id)
        if item is None or item.status != ITEM_PENDING:
            continue
        await action_items.approve_item(db, project, ctx.user, meeting, item, commit=False)
    await db.commit()
    updated = {item.id: item for item in await action_items.list_items(db, meeting)}
    return [updated[item_id] for item_id in payload.ids if item_id in updated]


@router.get(f"{_P}/{{meeting_id}}/action-items/", response_model=list[ActionItemOut])
async def list_action_items(meeting: Meeting = Depends(get_meeting_or_404), db: AsyncSession = Depends(get_db)):
    return await action_items.list_items(db, meeting)


@router.patch(f"{_P}/{{meeting_id}}/action-items/{{item_id}}/", response_model=ActionItemOut)
async def patch_action_item(meeting_id: str, item_id: str, payload: ActionItemPatch,
                            project: Project = Depends(require_project_write_access),
                            db: AsyncSession = Depends(get_db)):
    meeting = await service.get_meeting(db, project, meeting_id)
    item = await action_items.get_item(db, meeting, item_id)
    return await action_items.update_item(db, project, item, payload)


@router.post(f"{_P}/{{meeting_id}}/action-items/{{item_id}}/approve/", response_model=ActionItemOut)
async def approve_action_item(meeting_id: str, item_id: str,
                              project: Project = Depends(require_project_write_access),
                              ctx: WorkspaceContext = Depends(get_workspace_context),
                              db: AsyncSession = Depends(get_db)):
    meeting = await service.get_meeting(db, project, meeting_id)
    item = await action_items.get_item(db, meeting, item_id)
    return await action_items.approve_item(db, project, ctx.user, meeting, item)


@router.post(f"{_P}/{{meeting_id}}/action-items/{{item_id}}/dismiss/", response_model=ActionItemOut)
async def dismiss_action_item(meeting_id: str, item_id: str,
                              project: Project = Depends(require_project_write_access),
                              ctx: WorkspaceContext = Depends(get_workspace_context),
                              db: AsyncSession = Depends(get_db)):
    meeting = await service.get_meeting(db, project, meeting_id)
    item = await action_items.get_item(db, meeting, item_id)
    return await action_items.dismiss_item(db, ctx.user, item)
