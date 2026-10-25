from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from gigsnano_api.agent.runner import AgentSignal, AgentText, run_agent
from gigsnano_api.agent.situation import build_situation
from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.agent.tools.belt import build_repo_context_registry
from gigsnano_api.agent.tools.instructions import REPO_CONTEXT_INSTRUCTION
from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.billing.enforcement import ensure_positive_balance
from gigsnano_api.bmad.description import (
    DescriptionExtractionFailed,
    run_finalize_description,
)
from gigsnano_api.bmad.finalize import (
    EpicBreakDownConflict,
    ExtractionFailed,
    FinalizeConflict,
    run_finalize,
)
from gigsnano_api.bmad.loader import (
    NonLlmStepError,
    bmad_version,
    get_registry,
    workflow_for_story,
)
from gigsnano_api.bmad.prompt import build_messages, build_system, gather_context
from gigsnano_api.bmad.provider import (
    PROPOSE_FINALIZE_TOOL,
    FakeProvider,
    LLMProvider,
    get_llm_provider,
)
from gigsnano_api.bmad.sse import SSE_DONE, SSE_HEADERS, SSE_MEDIA_TYPE, sse_event
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.documents.router import serialize_document
from gigsnano_api.features.stories.labels import load_story_label_ids
from gigsnano_api.llm.usage import record_llm_usage, usage_event_payload
from gigsnano_api.marketplace.deps import (
    StoryRouteAccess,
    billing_workspace_id,
    require_story_route_access,
    workspace_slug_from_route,
)
from gigsnano_api.models import (
    Artifact,
    ChatMessage,
    ChatThread,
    EChatRole,
    ELlmUsageOperation,
    ELlmUsageSource,
    ESessionState,
    EStoryType,
    Story,
    WorkflowSession,
)
from gigsnano_api.models.workspace import Workspace
from gigsnano_api.shared.context import reject_if_project_viewer
from gigsnano_api.shared.serializers import serialize_story, sub_issue_counts
from gigsnano_api.webhooks.sender import WebhookSender, get_webhook_sender
from gigsnano_api.workspace.digest import repo_context_block

router = APIRouter(tags=["bmad"])


async def _finalize_signal_never(ctx: ToolContext, args: dict) -> ToolResult:
    # `propose_finalize` is a declared signal tool: run_agent yields AgentSignal and
    # returns before any handler runs, so this is never invoked.
    return ToolResult("", is_error=True)


_FINALIZE_SIGNAL = Tool(
    name=PROPOSE_FINALIZE_TOOL["name"],
    description=PROPOSE_FINALIZE_TOOL["description"],
    input_schema=PROPOSE_FINALIZE_TOOL["input_schema"],
    handler=_finalize_signal_never,
    mutating=False,
)


class ChatMessageOut(BaseModel):
    id: str
    role: EChatRole
    content: str
    created_at: datetime


class ThreadOut(BaseModel):
    id: str
    story_id: str
    workflow_id: str
    agent: str
    state: str
    messages: list[ChatMessageOut]


class OpenThreadPayload(BaseModel):
    workflow: str | None = None


def _epic_context_block(story: Story) -> str:
    return f'<epic title="{story.title}">\n{story.description or ""}\n</epic>'


async def _thread_bundle(
    db: AsyncSession, story: Story
) -> tuple[ChatThread, WorkflowSession, list[ChatMessage]] | None:
    thread = (
        await db.execute(select(ChatThread).where(ChatThread.story_id == story.id))
    ).scalar_one_or_none()
    if thread is None:
        return None
    session = (
        await db.execute(
            select(WorkflowSession).where(WorkflowSession.thread_id == thread.id)
        )
    ).scalar_one()
    messages = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.thread_id == thread.id)
                .order_by(ChatMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    return thread, session, list(messages)


def _thread_out(
    thread: ChatThread, session: WorkflowSession, messages: list[ChatMessage], story: Story
) -> ThreadOut:
    spec = get_registry()[session.workflow_id]
    return ThreadOut(
        id=thread.id,
        story_id=story.id,
        workflow_id=session.workflow_id,
        agent=story.bmad_agent or spec.persona_name.title(),
        state=session.state.value,
        messages=[
            ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
            for m in messages
        ],
    )


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/thread/",
    response_model=ThreadOut,
)
async def open_thread(
    workspace_slug: str,
    response: Response,
    payload: OpenThreadPayload | None = None,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    story = route.story
    project = route.project
    if route.member_ctx is not None:
        await reject_if_project_viewer(db, route.member_ctx, project.id)
    body = payload or OpenThreadPayload()

    if (
        story.type == EStoryType.EPIC
        and body.workflow == "bmad-break-down-epic"
    ):
        workflow_id = "bmad-break-down-epic"
        counts = await sub_issue_counts(db, [story.id])
        if counts.get(story.id, 0) > 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "epic_already_broken_down"
            )
    else:
        try:
            workflow_id = workflow_for_story(story.bmad_workflow)
        except NonLlmStepError:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "This step is completed directly on the board, not via an agent chat",
            )
        if story.bmad_workflow is not None and story.bmad_is_locked:
            raise HTTPException(status.HTTP_409_CONFLICT, "Story is locked by BMAD dependencies")

    existing = await _thread_bundle(db, story)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _thread_out(*existing[:3], story=story)

    spec = get_registry()[workflow_id]
    context_docs = await gather_context(db, project.id, spec)
    thread = ChatThread(project_id=project.id, story_id=story.id)
    db.add(thread)
    await db.flush()
    session = WorkflowSession(
        thread_id=thread.id,
        workflow_id=workflow_id,
        bmad_version=bmad_version(),
        context_artifact_ids=[a.id for a in context_docs],
    )
    db.add(session)
    await db.commit()
    response.status_code = status.HTTP_201_CREATED
    return _thread_out(thread, session, [], story)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/thread/",
    response_model=ThreadOut,
)
async def get_thread(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    story = route.story
    bundle = await _thread_bundle(db, story)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thread for this story")
    return _thread_out(*bundle[:3], story=story)


class SendMessagePayload(BaseModel):
    content: str


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/thread/messages/",)
async def send_message(
    payload: SendMessagePayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    story = route.story
    project = route.project
    if route.member_ctx is not None:
        await reject_if_project_viewer(db, route.member_ctx, project.id)
    ws_id = billing_workspace_id(route)
    bundle = await _thread_bundle(db, story)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thread for this story")
    thread, session, messages = bundle
    if session.state in (ESessionState.FINALIZING, ESessionState.COMPLETED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Session is {session.state.value}")
    # Billing AFTER access/existence checks so non-members/missing threads 404, not 402.
    if not isinstance(llm, FakeProvider):
        await ensure_positive_balance(db, ws_id)

    user_msg = ChatMessage(thread_id=thread.id, role=EChatRole.USER, content=payload.content)
    db.add(user_msg)
    await db.commit()
    messages.append(user_msg)

    spec = get_registry()[session.workflow_id]
    context_docs = [
        a
        for a in [await db.get(Artifact, aid) for aid in session.context_artifact_ids]
        if a is not None
    ]
    extra_parts = []
    repo_block = await repo_context_block(project)
    if repo_block:
        extra_parts.append(repo_block)
    if session.workflow_id == "bmad-break-down-epic":
        extra_parts.append(_epic_context_block(story))
    # Unified turn (C2): give the BMAD agent the internal read-only repo/doc belt.
    # The situation tells it what's connected; the instruction tells it how to route;
    # the belt tools need the project id, so state it explicitly.
    workspace = await db.get(Workspace, project.workspace_id)
    role = route.member_ctx.role.value if route.member_ctx is not None else "member"
    situation = await build_situation(
        db, workspace, project.id, surface="bmad_story", thread_state=session.state.value
    )
    extra_parts.append(situation)
    extra_parts.append(REPO_CONTEXT_INSTRUCTION)
    extra_parts.append(
        f"The connected project's id is {project.id}; pass it as project_id to repo tools."
    )
    extra = "\n\n".join(extra_parts)
    system = build_system(spec, context_docs, extra_context=extra)
    llm_messages = build_messages(messages)

    registry = ToolRegistry.merged(
        build_repo_context_registry(), ToolRegistry([_FINALIZE_SIGNAL])
    )
    ctx_tool = ToolContext(
        db=db, workspace=workspace, user=user, role=role, project_id=project.id
    )
    totals = {"in": 0, "out": 0}

    async def on_usage(input_tokens: int | None, output_tokens: int | None) -> None:
        totals["in"] += input_tokens or 0
        totals["out"] += output_tokens or 0

    async def event_stream():
        text_id = str(uuid4())
        chunks: list[str] = []
        proposed = False
        yield sse_event({"type": "start"})
        yield sse_event({"type": "text-start", "id": text_id})
        try:
            async for event in run_agent(
                llm,
                system=system,
                messages=llm_messages,
                registry=registry,
                ctx=ctx_tool,
                on_usage=on_usage,
                signal_tools={"propose_finalize"},
            ):
                if isinstance(event, AgentText):
                    chunks.append(event.text)
                    yield sse_event({"type": "text-delta", "id": text_id, "delta": event.text})
                elif isinstance(event, AgentSignal) and event.name == "propose_finalize":
                    proposed = True
                # AgentToolCall / AgentToolResult: the belt runs silently — no new
                # frame types, so the frontend contract is untouched (SP4 adds chips).
            yield sse_event({"type": "text-end", "id": text_id})
            is_fake = isinstance(llm, FakeProvider)
            db.add(
                ChatMessage(
                    thread_id=thread.id,
                    role=EChatRole.ASSISTANT,
                    content="".join(chunks),
                    input_tokens=totals["in"],
                    output_tokens=totals["out"],
                )
            )
            usage = await record_llm_usage(
                db,
                source=ELlmUsageSource.BMAD_STORY,
                operation=ELlmUsageOperation.STREAM_TURN,
                workspace_id=ws_id,
                user_id=user.id,
                project_id=project.id,
                story_id=story.id,
                thread_id=thread.id,
                model=settings.anthropic_model if not is_fake else "fake",
                input_tokens=totals["in"],
                output_tokens=totals["out"],
                is_fake=is_fake,
            )
            if proposed:
                session.state = ESessionState.READY_TO_FINALIZE
                yield sse_event(
                    {"type": "data-session",
                     "data": {"state": ESessionState.READY_TO_FINALIZE.value}}
                )
            await db.commit()
            # After the commit: never report a charge that then fails to persist.
            yield sse_event(usage_event_payload(usage))
        except Exception:  # noqa: BLE001 — stream errors must reach the client as SSE
            if chunks:  # keep the partial text; user can retry (spec §7)
                db.add(
                    ChatMessage(
                        thread_id=thread.id,
                        role=EChatRole.ASSISTANT,
                        content="".join(chunks),
                    )
                )
                await db.commit()
            yield sse_event({"type": "error", "errorText": "The model stream failed — retry."})
        yield sse_event({"type": "finish"})
        yield SSE_DONE

    return StreamingResponse(event_stream(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/thread/finalize/",)
async def finalize_thread(
    workspace_slug: str,
    background: BackgroundTasks,
    route: StoryRouteAccess = Depends(require_story_route_access),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
    sender: WebhookSender = Depends(get_webhook_sender),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    story = route.story
    project = route.project
    if route.member_ctx is not None:
        await reject_if_project_viewer(db, route.member_ctx, project.id)
    slug = workspace_slug_from_route(route, workspace_slug)
    bundle = await _thread_bundle(db, story)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thread for this story")
    thread, session, messages = bundle
    if session.state in (ESessionState.FINALIZING, ESessionState.COMPLETED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Session is {session.state.value}")
    if not isinstance(llm, FakeProvider):
        await ensure_positive_balance(db, billing_workspace_id(route))
    try:
        artifact = await run_finalize(
            db, llm, project=project, story=story, thread=thread,
            session=session, messages=messages, actor=user,
            workspace_slug=slug,
            background=background, sender=sender, email_provider=email_provider,
        )
    except FinalizeConflict as err:
        raise HTTPException(status.HTTP_409_CONFLICT, str(err))
    except EpicBreakDownConflict:
        raise HTTPException(status.HTTP_409_CONFLICT, "epic_already_broken_down")
    except ExtractionFailed:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Document generation failed — the conversation is preserved; retry.",
        )
    counts = await sub_issue_counts(db, [story.id])
    # fresh artifact — set the committed value directly so serialize_document's
    # `artifact.comments` read doesn't trigger an async lazy-load (plain
    # assignment still fires the loader to diff old/new).
    set_committed_value(artifact, "comments", [])
    return {
        "artifact_id": artifact.id,
        "document": serialize_document(artifact, slug, project.name),
        "story": serialize_story(
            story, slug, counts, project.identifier,
            label_ids=await load_story_label_ids(db, [story.id]),
        ),
    }


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/thread/finalize-description/",)
async def finalize_description(
    workspace_slug: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """Distill the conversation into `story.description` (HTML). Unlike finalize/,
    this does NOT complete the story, create an Artifact, or touch BMAD locks —
    it's a parallel, non-destructive output target that stays callable at any time."""
    story = route.story
    project = route.project
    if route.member_ctx is not None:
        await reject_if_project_viewer(db, route.member_ctx, project.id)
    ws_id = billing_workspace_id(route)
    slug = workspace_slug_from_route(route, workspace_slug)
    bundle = await _thread_bundle(db, story)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thread for this story")
    thread, session, messages = bundle
    if not isinstance(llm, FakeProvider):
        await ensure_positive_balance(db, ws_id)
    try:
        story = await run_finalize_description(
            db,
            llm,
            workspace_id=ws_id,
            actor_user_id=user.id,
            thread_id=thread.id,
            project=project,
            story=story,
            session=session,
            messages=messages,
        )
    except DescriptionExtractionFailed:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Description generation failed — the conversation is preserved; retry.",
        )
    counts = await sub_issue_counts(db, [story.id])
    return {
        "story": serialize_story(
            story, slug, counts, project.identifier,
            label_ids=await load_story_label_ids(db, [story.id]),
        )
    }
