import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent_delegation.oauth_helpers import (
    build_install_url,
    generate_pkce_pair,
)
from gigsnano_api.agent_delegation.provider import (
    DelegationContext,
    resolve_agent_provider,
)
from gigsnano_api.agent_delegation.provider_claude_code import verify_anthropic_api_key
from gigsnano_api.agent_delegation.provider_cursor import verify_cursor_api_key
from gigsnano_api.agent_delegation.schemas import (
    ConnectionOut,
    CreateDelegationPayload,
    CursorApiKeyPayload,
    DelegationOut,
    InstallUrlOut,
    LaunchOut,
    LaunchPayload,
    OAuthCallbackPayload,
)
from gigsnano_api.agent_delegation.service import (
    create_delegation,
    get_user_connection,
    list_user_connections,
    load_delegation,
    serialize_connection,
    serialize_delegation,
)
from gigsnano_api.agent_delegation.state import sign_agent_state, verify_agent_state
from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.bmad.sse import sse_event
from gigsnano_api.core.db import get_db
from gigsnano_api.features.skills.launcher import LaunchBlocked, prepare_launch
from gigsnano_api.marketplace.deps import StoryRouteAccess, require_story_route_access
from gigsnano_api.models import (
    AgentConnection,
    Delegation,
    EAgentConnectionStatus,
    EAgentProvider,
    EDelegationStatus,
    EDelegationUnit,
)
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    get_workspace_context,
    reject_if_project_viewer,
    user_is_project_member,
)
from gigsnano_api.sync.github_oauth import decrypt_token, encrypt_token

logger = logging.getLogger("gigsnano.delegation")
router = APIRouter(tags=["agent-delegation"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "Connection": "keep-alive"}
_SSE_MEDIA_TYPE = "text/event-stream"
_TERMINAL = {EDelegationStatus.COMPLETED, EDelegationStatus.FAILED, EDelegationStatus.CANCELLED}

_VALID_PROVIDERS = {p.value for p in EAgentProvider}


@router.get("/agents/connections/", response_model=list[ConnectionOut])
async def list_connections(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return [serialize_connection(c) for c in await list_user_connections(db, user.id)]


@router.post("/agents/connections/{provider}/install-url/", response_model=InstallUrlOut)
async def install_url(
    provider: str,
    user: User = Depends(get_current_user),
):
    if provider not in _VALID_PROVIDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown provider")
    prov = EAgentProvider(provider)
    if prov == EAgentProvider.CURSOR:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cursor connects with an API key. Use POST /agents/connections/cursor/connect/.",
        )
    pkce_verifier: str | None = None
    pkce_challenge: str | None = None
    if prov == EAgentProvider.CODEX:
        pkce_verifier, pkce_challenge = generate_pkce_pair()
    state = sign_agent_state(user.id, provider, pkce_verifier=pkce_verifier)
    return InstallUrlOut(url=build_install_url(prov, state, pkce_challenge=pkce_challenge))


@router.post("/agents/connections/cursor/connect/", response_model=ConnectionOut)
async def connect_cursor_api_key(
    payload: CursorApiKeyPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "API key is required")
    try:
        profile = await verify_cursor_api_key(api_key)
    except httpx.HTTPError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Cursor API key") from err

    label = profile.get("email") or profile.get("userEmail") or user.email
    provider = EAgentProvider.CURSOR
    conn = await get_user_connection(db, user.id, provider)
    if conn is None:
        conn = AgentConnection(user_id=user.id, provider=provider)
        db.add(conn)
    conn.account_label = f"cursor: {label}"
    conn.status = EAgentConnectionStatus.CONNECTED
    conn.access_token_encrypted = encrypt_token(api_key)
    await db.commit()
    await db.refresh(conn)
    return serialize_connection(conn)


@router.post("/agents/connections/claude/connect/", response_model=ConnectionOut)
async def connect_claude_api_key(
    payload: CursorApiKeyPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """BYO Anthropic API key (Console → API Keys) — the supported programmatic path
    for Claude, mirroring the Cursor key flow. Validated, then stored encrypted."""
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "API key is required")
    try:
        await verify_anthropic_api_key(api_key)
    except httpx.HTTPError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Anthropic API key") from err

    provider = EAgentProvider.CLAUDE_CODE
    conn = await get_user_connection(db, user.id, provider)
    if conn is None:
        conn = AgentConnection(user_id=user.id, provider=provider)
        db.add(conn)
    conn.account_label = f"claude: {user.email}"
    conn.status = EAgentConnectionStatus.CONNECTED
    conn.access_token_encrypted = encrypt_token(api_key)
    await db.commit()
    await db.refresh(conn)
    return serialize_connection(conn)


@router.post("/agents/oauth/callback/", response_model=ConnectionOut)
async def oauth_callback(
    payload: OAuthCallbackPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        state_user_id, provider_value, pkce_verifier = verify_agent_state(payload.state)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(err))
    if state_user_id != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "State/user mismatch")
    provider = EAgentProvider(provider_value)
    if provider == EAgentProvider.CURSOR:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cursor connects with an API key, not OAuth.",
        )
    provider_impl = resolve_agent_provider(provider, for_oauth_exchange=True)

    token = "fake-agent-token"  # nosec B105 - keyless-dev placeholder
    exchange = getattr(provider_impl, "exchange_code", None)
    if exchange is not None and payload.code != "dev":
        try:
            token = await exchange(provider, payload.code, pkce_verifier=pkce_verifier)
        except (httpx.HTTPError, ValueError) as err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"OAuth exchange failed: {err}")

    conn = await get_user_connection(db, user.id, provider)
    if conn is None:
        conn = AgentConnection(user_id=user.id, provider=provider)
        db.add(conn)
    conn.account_label = f"{provider.value}: {user.email}"
    conn.status = EAgentConnectionStatus.CONNECTED
    conn.access_token_encrypted = encrypt_token(token)
    await db.commit()
    await db.refresh(conn)
    return serialize_connection(conn)


@router.delete("/agents/connections/{connection_id}/")
async def disconnect(
    connection_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    conn = await db.get(AgentConnection, connection_id)
    if conn is None or conn.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
    await db.delete(conn)
    await db.commit()
    return {"success": True}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _story_model():
    from gigsnano_api.models import Story

    return Story


async def _validate_connection(
    db: AsyncSession, route: StoryRouteAccess, connection_id: str
) -> AgentConnection:
    if route.member_ctx is not None:
        await reject_if_project_viewer(db, route.member_ctx, route.project.id)
    conn = await db.get(AgentConnection, connection_id)
    if conn is None or conn.user_id != route.user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
    if conn.status != EAgentConnectionStatus.CONNECTED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Agent connection is not active")
    return conn


async def _start_delegation(
    db: AsyncSession,
    route: StoryRouteAccess,
    conn: AgentConnection,
    payload: CreateDelegationPayload,
) -> Delegation:
    """Create the delegation row + kick off the external job (no-op for the fake
    provider). Shared by dispatch_delegation and the control-plane launch."""
    token = decrypt_token(conn.access_token_encrypted) if conn.access_token_encrypted else None
    provider_impl = resolve_agent_provider(conn.provider, access_token=token)
    row = await create_delegation(
        db,
        story_id=route.story.id,
        project_id=route.project.id,
        workspace_id=route.project.workspace_id,
        delegated_by=route.user.id,
        conn=conn,
        payload=payload,
    )
    ctx = _context_for(route.story, conn, payload, access_token=token)
    start = await provider_impl.start(token, ctx)
    if start.external_ref:
        row.external_ref = start.external_ref
        await db.commit()
        await db.refresh(row)
    return row


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/delegations/",
    response_model=DelegationOut,
)
async def dispatch_delegation(
    payload: CreateDelegationPayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    conn = await _validate_connection(db, route, payload.connection_id)
    row = await _start_delegation(db, route, conn, payload)
    from gigsnano_api.models import Workspace

    workspace = await db.get(Workspace, route.project.workspace_id)
    return serialize_delegation(row, workspace.slug if workspace else "")


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/launch/",
    response_model=LaunchOut,
    status_code=status.HTTP_201_CREATED,
)
async def launch_story(
    payload: LaunchPayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """"Accept & run" (GIN-342): apply the reviewed Execution Profile, then delegate
    to the chosen remote agent with the pinned skills injected into its prompt. The
    control-plane refuses (409) to start a stale / no-profile / missing-required run
    — the "can't start silently" guarantee. Validates the connection *before*
    prepare_launch so a bad connection never leaks a run."""
    conn = await _validate_connection(db, route, payload.connection_id)
    try:
        # The AgentRun prepare_launch creates is telemetry-only (no background
        # persona LLM run is dispatched — the remote agent does the work via the
        # delegation), so it is deliberately NOT metered like coordinate/create_run.
        plan = await prepare_launch(db, route.story, route.project.workspace_id)
    except LaunchBlocked as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from None

    task = f"{route.story.title}\n{route.story.description or ''}".strip()
    custom_prompt = f"{plan.skill_prompt}\n\n---\n\n# Task\n{task}" if plan.skill_prompt else task
    row = await _start_delegation(
        db, route, conn,
        CreateDelegationPayload(
            unit_type=EDelegationUnit.WORK_ITEM,
            unit_id=route.story.id,
            connection_id=conn.id,
            custom_prompt=custom_prompt,
        ),
    )
    from gigsnano_api.models import Workspace

    workspace = await db.get(Workspace, route.project.workspace_id)
    return LaunchOut(
        run_id=plan.run_id,
        agent=plan.agent,
        required=plan.required,
        delegation=serialize_delegation(row, workspace.slug if workspace else ""),
    )


def _context_for(
    story,
    conn,
    payload: CreateDelegationPayload,
    *,
    access_token: str | None = None,
) -> DelegationContext:
    return DelegationContext(
        unit_type=payload.unit_type,
        title=story.title,
        description=story.description or "",
        repo_full_name=None,
        custom_prompt=(payload.custom_prompt or "").strip() or None,
        access_token=access_token,
    )


async def notify_awaiting_review(
    db: AsyncSession, delegation: Delegation, previous: EDelegationStatus
) -> None:
    """Tell the delegator their agent output is ready, once per real transition, if
    they are still an active member of the workspace and the project. No commit:
    the caller commits the status change with it. Never raises — a notification
    problem must not fail the delegation."""
    if delegation.status != EDelegationStatus.AWAITING_REVIEW or previous == delegation.status:
        return
    try:
        async with db.begin_nested():  # savepoint: a failure rolls back only the notify
            await _notify_delegator(db, delegation)
    except Exception:  # noqa: BLE001 — the delegation outcome must not depend on push
        logger.exception("awaiting-review notification failed for delegation=%s",
                         delegation.id)


async def _notify_delegator(db: AsyncSession, delegation: Delegation) -> None:
    from gigsnano_api.features.notifications import router as notifications
    from gigsnano_api.models import ENotificationKind, Story

    user_id = delegation.delegated_by
    if not await notifications.is_active_workspace_member(
        db, delegation.workspace_id, user_id
    ) or not await notifications.is_active_project_member(db, delegation.project_id, user_id):
        return
    story = await db.get(Story, delegation.unit_id)
    await notifications.notify(
        db,
        delegation.workspace_id,
        receiver_id=user_id,
        kind=ENotificationKind.AGENT,
        title="Agent output ready for review",
        body=(story.title if story else "Agent work")[:300],
        project_id=delegation.project_id,
        href="/inbox",
    )


async def _load_scoped(db, ctx: WorkspaceContext, delegation_id: str) -> Delegation:
    row = await load_delegation(db, delegation_id)
    if row is None or row.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delegation not found")
    if ctx.role not in ADMINS and not await user_is_project_member(
        db, ctx.user.id, row.project_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delegation not found")
    return row


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/delegations/{delegation_id}/",
    response_model=DelegationOut,
)
async def get_delegation(
    delegation_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_scoped(db, ctx, delegation_id)
    return serialize_delegation(row, ctx.workspace.slug)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/delegations/{delegation_id}/stream/"
)
async def stream_delegation(
    delegation_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_scoped(db, ctx, delegation_id)
    conn = await db.get(AgentConnection, row.connection_id) if row.connection_id else None
    access_token = (
        decrypt_token(conn.access_token_encrypted)
        if conn and conn.access_token_encrypted
        else None
    )
    provider = conn.provider if conn else row.provider
    provider_impl = resolve_agent_provider(provider, access_token=access_token)
    story = await db.get(_story_model(), row.unit_id)
    ctx_obj = DelegationContext(
        unit_type=row.unit_type,
        title=story.title if story else "",
        description=(story.description or "") if story else "",
        repo_full_name=None,
        custom_prompt=row.custom_prompt,
        access_token=access_token,
    )
    # Bind of the request-scoped `db` session (the real app engine in production,
    # the test's overridden in-memory engine in tests) — reused below for a fresh
    # session so the generator never depends on the request session's lifetime.
    bind = db.bind

    async def event_stream():
        # Fresh session: the request session may close before the generator drains.
        async with AsyncSession(bind=bind, expire_on_commit=False) as sdb:
            live = await sdb.get(Delegation, delegation_id)
            if live is None or live.status in _TERMINAL:
                yield sse_event({"status": live.status.value if live else "failed",
                                 "message": "", "at": _now()})
                yield "data: [DONE]\n\n"
                return
            try:
                async for ev in provider_impl.follow(ctx_obj, live.external_ref):
                    # Another request (cancel) may have committed a terminal status
                    # via its own session while we were awaiting the provider; re-read
                    # before overwriting so we never clobber a cancel with a stale event.
                    await sdb.refresh(live)
                    if live.status in _TERMINAL:
                        # TODO(real-provider): signal provider.follow() to stop on cancel
                        yield sse_event({"status": live.status.value, "message": "",
                                         "at": _now()})
                        break
                    previous = live.status
                    live.status = ev.status
                    await notify_awaiting_review(sdb, live, previous)
                    if ev.result is not None:
                        live.result = ev.result
                    await sdb.commit()
                    yield sse_event({"status": ev.status.value, "message": ev.message,
                                     "at": _now()})
            except Exception:  # noqa: BLE001 — surface as SSE, persist failure
                live.status = EDelegationStatus.FAILED
                live.error = "The agent run failed — retry."
                await sdb.commit()
                yield sse_event({"status": "failed", "message": live.error, "at": _now()})
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type=_SSE_MEDIA_TYPE, headers=_SSE_HEADERS)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/delegations/{delegation_id}/cancel/",
    response_model=DelegationOut,
)
async def cancel_delegation(
    delegation_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_scoped(db, ctx, delegation_id)
    # _load_scoped is shared with the read routes (get/stream) above, so the
    # write-guard is applied here rather than inside it (mirrors update_story
    # in features/stories/router.py).
    await reject_if_project_viewer(db, ctx, row.project_id)
    if row.delegated_by != ctx.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your delegation")
    if row.status in _TERMINAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already finished")
    row.status = EDelegationStatus.CANCELLED
    await db.commit()
    await db.refresh(row)
    return serialize_delegation(row, ctx.workspace.slug)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/delegations/{delegation_id}/retry/",
    response_model=DelegationOut,
)
async def retry_delegation(
    delegation_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_scoped(db, ctx, delegation_id)
    await reject_if_project_viewer(db, ctx, row.project_id)
    if row.delegated_by != ctx.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your delegation")
    row.status = EDelegationStatus.QUEUED
    row.result = None
    row.error = None
    await db.commit()
    await db.refresh(row)
    return serialize_delegation(row, ctx.workspace.slug)
