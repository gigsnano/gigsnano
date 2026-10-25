"""Workspace-level GigsAI chat — persisted threads (many per workspace, history)
+ an SSE message endpoint. Reuses the BMAD sse/provider/build_messages seams;
no finalize, no workflow state machine."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent.runner import (
    AgentText,
    AgentToolCall,
    AgentToolConfirm,
    AgentToolResult,
    resume_agent,
    run_agent,
)
from gigsnano_api.agent.situation import build_situation
from gigsnano_api.agent.tools.base import ToolContext, ToolRegistry
from gigsnano_api.agent.tools.belt import build_repo_context_registry
from gigsnano_api.agent.tools.work_items import build_work_item_registry
from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.billing.enforcement import ensure_positive_balance
from gigsnano_api.bmad.prompt import build_messages
from gigsnano_api.bmad.provider import FakeProvider, LLMProvider, get_llm_provider
from gigsnano_api.bmad.sse import SSE_DONE, SSE_HEADERS, SSE_MEDIA_TYPE, sse_event
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.features.gigs_ai.prompt import (
    GIGS_MODEL_MAP,
    build_gigs_system,
    gather_gigs_context,
    load_gigs_reference_documents,
    resolve_gigs_agent,
)
from gigsnano_api.features.gigs_ai.schemas import (
    ConfirmToolsPayload,
    CreateGigsThreadPayload,
    GigsMessageOut,
    GigsThreadOut,
    SendGigsMessagePayload,
    UpdateGigsThreadPayload,
)
from gigsnano_api.lib.document_text import attachment_http_error, attachment_to_llm_text
from gigsnano_api.llm.usage import record_llm_usage, usage_event_payload
from gigsnano_api.models import (
    EChatRole,
    ELlmUsageOperation,
    ELlmUsageSource,
    GigsMessage,
    GigsThread,
    Project,
)
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
    user_is_project_member,
)

router = APIRouter(tags=["gigs-ai"])

_P = "/workspaces/{workspace_slug}/gigs-ai"


def build_gigs_ai_registry() -> ToolRegistry:
    """The full GigsAI tool surface: work-item read/write tools plus the
    read-only repo-context belt (code + document tools) so the assistant can
    trace the connected repo and cite docs when asked how something works."""
    return ToolRegistry.merged(build_work_item_registry(), build_repo_context_registry())


async def _get_thread_or_404(db: AsyncSession, ctx: WorkspaceContext, thread_id: str) -> GigsThread:
    thread = await db.get(GigsThread, thread_id)
    if thread is None or thread.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thread not found")
    if (
        thread.project_id is not None
        and ctx.role not in ADMINS
        and not await user_is_project_member(db, ctx.user.id, thread.project_id)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thread not found")
    return thread


async def _thread_messages(db: AsyncSession, thread_id: str) -> list[GigsMessage]:
    rows = (
        await db.execute(
            select(GigsMessage)
            .where(GigsMessage.thread_id == thread_id)
            .order_by(GigsMessage.created_at)
        )
    ).scalars()
    return list(rows.all())


def _thread_out(
    thread: GigsThread, workspace_slug: str, messages: list[GigsMessage]
) -> GigsThreadOut:
    return GigsThreadOut(
        id=thread.id,
        workspace_slug=workspace_slug,
        project_id=thread.project_id,
        title=thread.title,
        model=thread.model,
        messages=[
            GigsMessageOut(id=m.id, role=m.role.value, content=m.content, created_at=m.created_at)
            for m in messages
        ],
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.post(f"{_P}/threads/", response_model=GigsThreadOut, status_code=status.HTTP_201_CREATED)
async def create_thread(
    payload: CreateGigsThreadPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.project_id is not None:
        project = await db.get(Project, payload.project_id)
        if project is None or project.workspace_id != ctx.workspace.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project not in this workspace")
        if ctx.role not in ADMINS and not await user_is_project_member(db, ctx.user.id, project.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    thread = GigsThread(
        workspace_id=ctx.workspace.id, project_id=payload.project_id, model=payload.model
    )
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    return _thread_out(thread, ctx.workspace.slug, [])


@router.get(f"{_P}/threads/", response_model=OffsetPageOut[GigsThreadOut])
async def list_threads(
    limit: int = 25,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    conditions = [GigsThread.workspace_id == ctx.workspace.id]
    accessible = await accessible_project_ids(db, ctx)
    if accessible is not None:  # None = admin/owner, sees all
        conditions.append(GigsThread.project_id.is_(None) | GigsThread.project_id.in_(accessible))
    base = and_(*conditions)
    total = int((await db.scalar(select(func.count(GigsThread.id)).where(base))) or 0)
    rows = (
        (
            await db.execute(
                select(GigsThread)
                .where(base)
                .order_by(GigsThread.updated_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return OffsetPageOut(
        items=[_thread_out(t, ctx.workspace.slug, []) for t in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(f"{_P}/threads/{{thread_id}}/", response_model=GigsThreadOut)
async def get_thread(
    thread_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    thread = await _get_thread_or_404(db, ctx, thread_id)
    messages = await _thread_messages(db, thread.id)
    return _thread_out(thread, ctx.workspace.slug, messages)


@router.patch(f"{_P}/threads/{{thread_id}}/", response_model=GigsThreadOut)
async def update_thread(
    thread_id: str,
    payload: UpdateGigsThreadPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    thread = await _get_thread_or_404(db, ctx, thread_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is not None:
            setattr(thread, field, value)
    await db.commit()
    messages = await _thread_messages(db, thread.id)
    return _thread_out(thread, ctx.workspace.slug, messages)


@router.delete(f"{_P}/threads/{{thread_id}}/")
async def delete_thread(
    thread_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    thread = await _get_thread_or_404(db, ctx, thread_id)
    await db.delete(thread)
    await db.commit()
    return {"success": True}


async def _stream_agent_turn(
    *,
    agent_events,
    thread: GigsThread,
    ctx: WorkspaceContext,
    user: User,
    db: AsyncSession,
    llm: LLMProvider,
    llm_messages: list[dict],
    totals: dict[str, int],
    model: str | None,
):
    """Drive one agentic turn (fresh or resumed) to SSE. Shared by `send_message`
    and `confirm_tools` so the event-mapping/persistence/usage-recording logic
    that both need lives in exactly one place."""
    chunks: list[str] = []
    is_fake = isinstance(llm, FakeProvider)
    # A text part must NOT span a tool call: the AI SDK drops text-deltas that
    # arrive under the same part id after a tool event, so the model's post-tool
    # answer would silently never render. Bracket each contiguous text run in its
    # own part instead — `text_id` holds the currently-open part, or None.
    text_id: str | None = None
    yield sse_event({"type": "start"})
    try:
        async for event in agent_events:
            if isinstance(event, AgentText):
                if text_id is None:
                    text_id = str(uuid4())
                    yield sse_event({"type": "text-start", "id": text_id})
                chunks.append(event.text)
                yield sse_event({"type": "text-delta", "id": text_id, "delta": event.text})
            elif isinstance(event, AgentToolCall):
                if text_id is not None:
                    yield sse_event({"type": "text-end", "id": text_id})
                    text_id = None
                yield sse_event(
                    {
                        "type": "tool_call",
                        "tool_use_id": event.id,
                        "name": event.name,
                        "input": event.input,
                    }
                )
            elif isinstance(event, AgentToolResult):
                yield sse_event(
                    {
                        "type": "tool_result",
                        "tool_use_id": event.id,
                        "summary": event.summary,
                        "is_error": event.is_error,
                        "link": event.link,
                    }
                )
            elif isinstance(event, AgentToolConfirm):
                # Mutating tool awaiting confirmation — pause the turn. Charge the
                # tokens the model already spent getting here (an abandoned
                # confirmation must still be billed — GIN-33 I3), then persist the
                # in-flight messages so `confirm_tools` can resume the loop with
                # the user's decision. `confirm_tools` starts its own totals at 0
                # so the resume records only its own continuation rounds.
                if text_id is not None:
                    yield sse_event({"type": "text-end", "id": text_id})
                    text_id = None
                if not chunks:
                    # Tool-only turn: the model went straight to a mutating tool
                    # with no preamble text. The client hosts the confirmation card
                    # INSIDE an assistant message, so a turn with no text renders no
                    # assistant bubble and the card has nowhere to go — the request
                    # silently stalls with nothing for the user to approve. Emit a
                    # short lead-in so an assistant bubble always exists.
                    lead_id = str(uuid4())
                    lead = "I need your confirmation before I make these changes:"
                    yield sse_event({"type": "text-start", "id": lead_id})
                    yield sse_event({"type": "text-delta", "id": lead_id, "delta": lead})
                    yield sse_event({"type": "text-end", "id": lead_id})
                    chunks.append(lead)
                usage = await record_llm_usage(
                    db,
                    source=ELlmUsageSource.GIGS_AI,
                    operation=ELlmUsageOperation.STREAM_TURN,
                    workspace_id=ctx.workspace.id,
                    user_id=user.id,
                    project_id=thread.project_id,
                    thread_id=thread.id,
                    model=(model or settings.anthropic_model) if not is_fake else "fake",
                    input_tokens=totals["in"],
                    output_tokens=totals["out"],
                    is_fake=is_fake,
                )
                thread.pending_tool_calls = {
                    "messages": llm_messages,
                    "tool_use": {"id": event.id, "name": event.name, "input": event.input},
                }
                await db.commit()
                # Emitted after the commit: the client must never be told about a
                # charge that then fails to persist.
                yield sse_event(usage_event_payload(usage))
                yield sse_event(
                    {
                        "type": "tool_confirmation",
                        "tool_use_id": event.id,
                        "name": event.name,
                        "input": event.input,
                    }
                )
                yield sse_event({"type": "finish"})
                yield SSE_DONE
                return
        if text_id is not None:
            yield sse_event({"type": "text-end", "id": text_id})
            text_id = None
        if chunks:
            db.add(
                GigsMessage(
                    thread_id=thread.id,
                    role=EChatRole.ASSISTANT,
                    content="".join(chunks),
                )
            )
        usage = await record_llm_usage(
            db,
            source=ELlmUsageSource.GIGS_AI,
            operation=ELlmUsageOperation.STREAM_TURN,
            workspace_id=ctx.workspace.id,
            user_id=user.id,
            project_id=thread.project_id,
            thread_id=thread.id,
            model=(model or settings.anthropic_model) if not is_fake else "fake",
            input_tokens=totals["in"],
            output_tokens=totals["out"],
            is_fake=is_fake,
        )
        thread.pending_tool_calls = None
        await db.commit()
        yield sse_event(usage_event_payload(usage))
    except Exception:  # noqa: BLE001 — stream errors must reach the client as SSE
        if text_id is not None:
            yield sse_event({"type": "text-end", "id": text_id})
            text_id = None
        if chunks:
            db.add(
                GigsMessage(
                    thread_id=thread.id,
                    role=EChatRole.ASSISTANT,
                    content="".join(chunks),
                )
            )
            await db.commit()
        yield sse_event({"type": "error", "errorText": "The model stream failed — retry."})
    yield sse_event({"type": "finish"})
    yield SSE_DONE


@router.post(f"{_P}/threads/{{thread_id}}/messages/")
async def send_message(
    thread_id: str,
    payload: SendGigsMessagePayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    thread = await _get_thread_or_404(db, ctx, thread_id)

    # Billing AFTER access/existence: a non-member or missing resource must 404,
    # not 402 (the balance gate can't be a route dependency — it would run first).
    if not isinstance(llm, FakeProvider):
        await ensure_positive_balance(db, ctx.workspace.id)

    db.add(GigsMessage(thread_id=thread.id, role=EChatRole.USER, content=payload.content))
    if thread.title == "New chat" and payload.content.strip():
        thread.title = payload.content.strip()[:80]
    await db.commit()

    # Rebuild the FULL ordered history from persistence — context is server-owned.
    history = await _thread_messages(db, thread.id)
    situation = await build_situation(db, ctx.workspace, thread.project_id, surface="gigs_ai")
    context = situation + "\n\n" + await gather_gigs_context(db, ctx.workspace, thread.project_id)
    reference_docs = await load_gigs_reference_documents(db, ctx.workspace, payload.document_ids)
    inline_docs: list[dict] = []
    for attachment in payload.attachments:
        try:
            content = attachment_to_llm_text(
                file_name=attachment.file_name,
                mime_type=attachment.mime_type,
                content=attachment.content,
            )
        except Exception as exc:
            raise attachment_http_error(exc) from exc
        inline_docs.append(
            {
                "title": attachment.title,
                "file_name": attachment.file_name,
                "content": content,
            }
        )
    system = build_gigs_system(
        context,
        agent=resolve_gigs_agent(payload.agent_id),
        context_docs=[*reference_docs, *inline_docs],
    )
    llm_messages = build_messages(history)
    model = GIGS_MODEL_MAP.get(thread.model)

    registry = build_gigs_ai_registry()
    ctx_tool = ToolContext(
        db=db, workspace=ctx.workspace, user=user, role=ctx.role, project_id=thread.project_id
    )
    totals = {"in": 0, "out": 0}

    async def on_usage(input_tokens: int | None, output_tokens: int | None) -> None:
        totals["in"] += input_tokens or 0
        totals["out"] += output_tokens or 0

    agent_events = run_agent(
        llm,
        system=system,
        messages=llm_messages,
        registry=registry,
        ctx=ctx_tool,
        on_usage=on_usage,
    )

    return StreamingResponse(
        _stream_agent_turn(
            agent_events=agent_events,
            thread=thread,
            ctx=ctx,
            user=user,
            db=db,
            llm=llm,
            llm_messages=llm_messages,
            totals=totals,
            model=model,
        ),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )


@router.post(f"{_P}/threads/{{thread_id}}/confirm-tools/")
async def confirm_tools(
    thread_id: str,
    payload: ConfirmToolsPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    thread = await _get_thread_or_404(db, ctx, thread_id)
    if not thread.pending_tool_calls:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No pending tool confirmation")

    if not isinstance(llm, FakeProvider):
        await ensure_positive_balance(db, ctx.workspace.id)

    pending = thread.pending_tool_calls
    llm_messages: list[dict] = pending["messages"]
    decisions = {d.tool_use_id: d.approved for d in payload.decisions}

    situation = await build_situation(db, ctx.workspace, thread.project_id, surface="gigs_ai")
    context = situation + "\n\n" + await gather_gigs_context(db, ctx.workspace, thread.project_id)
    system = build_gigs_system(context)
    model = GIGS_MODEL_MAP.get(thread.model)

    registry = build_gigs_ai_registry()
    ctx_tool = ToolContext(
        db=db, workspace=ctx.workspace, user=user, role=ctx.role, project_id=thread.project_id
    )
    # The paused round's tokens were already charged when the confirmation was
    # raised (GIN-33 I3) — this turn's usage record covers only the resume.
    totals = {"in": 0, "out": 0}

    async def on_usage(input_tokens: int | None, output_tokens: int | None) -> None:
        totals["in"] += input_tokens or 0
        totals["out"] += output_tokens or 0

    agent_events = resume_agent(
        llm,
        system=system,
        messages=llm_messages,
        registry=registry,
        ctx=ctx_tool,
        on_usage=on_usage,
        decisions=decisions,
    )

    # Clear pending state now, before the continuation (which runs the approved
    # handlers) starts — `resume_agent` is a lazy async generator, so nothing has
    # executed yet. A retried confirm-tools call (e.g. after a dropped connection
    # post-write-commit) then finds nothing pending and 404s instead of
    # re-running the approved write (GIN-33 I4).
    thread.pending_tool_calls = None
    await db.commit()

    return StreamingResponse(
        _stream_agent_turn(
            agent_events=agent_events,
            thread=thread,
            ctx=ctx,
            user=user,
            db=db,
            llm=llm,
            llm_messages=llm_messages,
            totals=totals,
            model=model,
        ),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
