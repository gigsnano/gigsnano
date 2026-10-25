"""Expert Rooms — workspace-level group chats where multiple BMAD-seeded experts
advise round-robin over a shared transcript. CRUD + participants + an `advance`
SSE endpoint that runs exactly one round via `run_room_round` (Task 4) and
persists each expert's completed turn as its own speaker-attributed message."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.billing.enforcement import ensure_positive_balance
from gigsnano_api.bmad.provider import FakeProvider, LLMProvider, get_llm_provider
from gigsnano_api.bmad.sse import SSE_DONE, SSE_HEADERS, SSE_MEDIA_TYPE, sse_event
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.features.experts.orchestrator import (
    RoomSpeaker,
    RoomText,
    RoomTurnEnd,
    run_room_round,
)
from gigsnano_api.features.experts.registry import get_expert, list_experts
from gigsnano_api.features.experts.schemas import (
    AddParticipantPayload,
    AdvanceRoomPayload,
    CreateRoomPayload,
    ExpertOut,
    RoomMessageOut,
    RoomOut,
)
from gigsnano_api.features.gigs_ai.prompt import build_gigs_system, gather_gigs_context
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    EChatRole,
    ELlmUsageOperation,
    ELlmUsageSource,
    GigsMessage,
    GigsThread,
)
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["rooms"])
_P = "/workspaces/{workspace_slug}/rooms"
ROOM_ROUND_CAP = 5


async def _get_room_or_404(db: AsyncSession, ctx: WorkspaceContext, room_id: str) -> GigsThread:
    room = await db.get(GigsThread, room_id)
    if room is None or room.workspace_id != ctx.workspace.id or room.kind != "room":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    return room


async def _room_messages(db: AsyncSession, room_id: str) -> list[GigsMessage]:
    rows = (
        await db.execute(
            select(GigsMessage)
            .where(GigsMessage.thread_id == room_id)
            .order_by(GigsMessage.created_at, GigsMessage.id)
        )
    ).scalars()
    return list(rows.all())


def _room_out(room: GigsThread, slug: str, messages: list[GigsMessage]) -> RoomOut:
    return RoomOut(
        id=room.id,
        workspace_slug=slug,
        title=room.title,
        participant_agent_ids=list(room.participant_agent_ids or []),
        messages=[
            RoomMessageOut(
                id=m.id, role=m.role.value, speaker=m.speaker, content=m.content, created_at=m.created_at
            )
            for m in messages
        ],
        created_at=room.created_at,
        updated_at=room.updated_at,
    )


@router.get(f"{_P}/experts/", response_model=list[ExpertOut])
async def list_room_experts(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return [
        ExpertOut(id=e.id, name=e.name, persona=e.persona, domain=e.domain, avatar_color=e.avatar_color)
        for e in await list_experts(db, ctx.workspace.id)
    ]


@router.post(f"{_P}/", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: CreateRoomPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    for agent_id in payload.participant_agent_ids:
        if await get_expert(db, ctx.workspace.id, agent_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown expert '{agent_id}'")
    room = GigsThread(
        workspace_id=ctx.workspace.id,
        kind="room",
        title=payload.title,
        participant_agent_ids=list(payload.participant_agent_ids),
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return _room_out(room, ctx.workspace.slug, [])


@router.get(f"{_P}/", response_model=OffsetPageOut[RoomOut])
async def list_rooms(
    limit: int = 25,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    base = and_(GigsThread.workspace_id == ctx.workspace.id, GigsThread.kind == "room")
    total = int((await db.scalar(select(func.count(GigsThread.id)).where(base))) or 0)
    rows = (
        await db.execute(
            select(GigsThread).where(base).order_by(GigsThread.updated_at.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()
    return OffsetPageOut(
        items=[_room_out(r, ctx.workspace.slug, []) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(f"{_P}/{{room_id}}/", response_model=RoomOut)
async def get_room(
    room_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(db, ctx, room_id)
    return _room_out(room, ctx.workspace.slug, await _room_messages(db, room.id))


@router.post(f"{_P}/{{room_id}}/participants/", response_model=RoomOut)
async def add_participant(
    room_id: str,
    payload: AddParticipantPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(db, ctx, room_id)
    if await get_expert(db, ctx.workspace.id, payload.agent_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown expert")
    ids = list(room.participant_agent_ids or [])
    if payload.agent_id not in ids:
        ids.append(payload.agent_id)
        room.participant_agent_ids = ids
        await db.commit()
    return _room_out(room, ctx.workspace.slug, await _room_messages(db, room.id))


@router.delete(f"{_P}/{{room_id}}/participants/{{agent_id}}/", response_model=RoomOut)
async def remove_participant(
    room_id: str,
    agent_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(db, ctx, room_id)
    room.participant_agent_ids = [i for i in (room.participant_agent_ids or []) if i != agent_id]
    await db.commit()
    return _room_out(room, ctx.workspace.slug, await _room_messages(db, room.id))


def _speaker_name(names: dict[str, str]):
    def name(speaker: str | None) -> str:
        return "You" if speaker is None else names.get(speaker, speaker)

    return name


@router.post(f"{_P}/{{room_id}}/advance/")
async def advance_room(
    room_id: str,
    payload: AdvanceRoomPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    room = await _get_room_or_404(db, ctx, room_id)
    if not isinstance(llm, FakeProvider):
        await ensure_positive_balance(db, ctx.workspace.id)

    has_human_content = bool(payload.content and payload.content.strip())
    if has_human_content:
        db.add(
            GigsMessage(
                thread_id=room.id, role=EChatRole.USER, content=payload.content.strip(), speaker=None
            )
        )
        room.rounds_since_human = 0
        await db.commit()

    participants = []
    for agent_id in room.participant_agent_ids or []:
        expert = await get_expert(db, ctx.workspace.id, agent_id)
        if expert is not None:
            participants.append(expert)
    is_fake = isinstance(llm, FakeProvider)
    model = None
    totals = {"in": 0, "out": 0}

    async def stream():
        yield sse_event({"type": "start"})
        # Cap guard: only blocks a bare "continue" advance — a fresh human message
        # always resets the counter above, so it never trips this branch.
        if not has_human_content and room.rounds_since_human >= ROOM_ROUND_CAP:
            yield sse_event({"type": "error", "errorText": "Paused — send a message to continue."})
            yield sse_event({"type": "finish"})
            yield SSE_DONE
            return
        if not participants:
            yield sse_event({"type": "error", "errorText": "Add at least one expert to the room."})
            yield sse_event({"type": "finish"})
            yield SSE_DONE
            return

        history = await _room_messages(db, room.id)
        transcript = [{"speaker": m.speaker, "content": m.content} for m in history]
        names = {e.id: e.name for e in participants}
        context = await gather_gigs_context(db, ctx.workspace, None)

        def build_system(expert, others):
            return build_gigs_system(context, agent=None) + [
                {"type": "text", "text": expert.system_prompt}
            ]

        # Accumulate each speaker's streamed deltas so the completed turn can be
        # persisted as one GigsMessage on its matching RoomTurnEnd.
        pending_turns: dict[str, list[str]] = {}
        # `created_at` is stamped per-row at flush via `utcnow`, and reads order by
        # `created_at` — two turns in the same round can land on the same microsecond
        # on Postgres, scrambling reload order. Stamp each turn in this round with a
        # strictly-increasing offset off one captured base so persisted order is
        # deterministic (the live SSE stream is unaffected either way).
        round_base = utcnow()
        turn_index = 0
        try:
            async for ev in run_room_round(
                llm,
                participants=participants,
                transcript=transcript,
                build_system=build_system,
                speaker_name=_speaker_name(names),
            ):
                if isinstance(ev, RoomSpeaker):
                    pending_turns[ev.id] = []
                    yield sse_event({"type": "room_speaker", "speaker_id": ev.id, "name": ev.name, "color": ev.color})
                elif isinstance(ev, RoomText):
                    pending_turns.setdefault(ev.speaker_id, []).append(ev.text)
                    yield sse_event({"type": "room_text", "speaker_id": ev.speaker_id, "delta": ev.text})
                elif isinstance(ev, RoomTurnEnd):
                    totals["in"] += ev.input_tokens or 0
                    totals["out"] += ev.output_tokens or 0
                    turn_text = "".join(pending_turns.pop(ev.speaker_id, []))
                    db.add(
                        GigsMessage(
                            thread_id=room.id,
                            role=EChatRole.ASSISTANT,
                            content=turn_text,
                            speaker=ev.speaker_id,
                            created_at=round_base + timedelta(microseconds=turn_index),
                        )
                    )
                    turn_index += 1
                    yield sse_event({"type": "room_turn_end", "speaker_id": ev.speaker_id})
        except Exception:  # noqa: BLE001 — surface as SSE, don't crash the stream
            yield sse_event({"type": "error", "errorText": "The room stream failed — retry."})

        room.rounds_since_human += 1
        await record_llm_usage(
            db,
            source=ELlmUsageSource.GIGS_AI,
            operation=ELlmUsageOperation.STREAM_TURN,
            workspace_id=ctx.workspace.id,
            user_id=user.id,
            project_id=None,
            thread_id=room.id,
            model=(model or settings.anthropic_model) if not is_fake else "fake",
            input_tokens=totals["in"],
            output_tokens=totals["out"],
            is_fake=is_fake,
        )
        await db.commit()
        yield sse_event({"type": "finish"})
        yield SSE_DONE

    return StreamingResponse(stream(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)
