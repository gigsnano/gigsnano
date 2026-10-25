
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.bmad.unlock import apply_story_locks
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.cycles.router import _get_cycle_or_404
from gigsnano_api.features.modules.router import _get_module_or_404
from gigsnano_api.features.mutations import (
    assert_unchanged,
    parse_expected_version,
    replay_or_conflict,
    store_idempotent,
)
from gigsnano_api.features.notifications.router import (
    emit_story_mentions,
    is_active_project_member,
    notify_project_members,
    notify_readiness_transition,
    notify_story_watchers,
    resolve_and_notify,
    sprint_zero_complete,
)
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.features.stories import impact as impact_svc
from gigsnano_api.features.stories.clone import (
    RESET_FIELDS,
    InvalidClone,
    clone_subtree,
)
from gigsnano_api.features.stories.labels import get_story_label_ids
from gigsnano_api.features.stories.queries import (
    _apply_project_story_filters,
    _apply_story_gigsql,
    _clamp_page,
    _story_list_order,
    _story_page,
)
from gigsnano_api.features.stories.schemas import (
    CloneItemOut,
    ClonePreviewOut,
    CloneResultOut,
    CloneStoryRequest,
    CreateStoryPayload,
    EDeleteCascade,
    EstimateOut,
    ImpactOut,
    StoryOut,
    SuggestedDependencyOut,
    UpdatePreviewOut,
    UpdateStoryPayload,
)
from gigsnano_api.features.stories.service import (
    _agent_ids,
    _apply_story_update,
    _collect_subtree_ids,
    _get_story_or_404,
    _get_trashed_story_or_404,
    _insert_story,
    _parse_code,
    _project_bmad_stories,
    _serialize_one,
    _story_code,
    _story_notification_href,
    _validate_settings_refs,
    apply_custom_field_values,
)
from gigsnano_api.features.stories.workspace_routes import router as workspace_router
from gigsnano_api.lib.mentions import resolve_mention_user_ids
from gigsnano_api.marketplace.access import EWorkItemAccessLevel
from gigsnano_api.marketplace.deps import StoryRouteAccess, require_story_route_access
from gigsnano_api.models import (
    EMemberStatus,
    ENotificationKind,
    EProjectActivityType,
    EStoryStatus,
    EWorkspaceRole,
    Project,
    Story,
    Workspace,
)
from gigsnano_api.models.idempotency import request_fingerprint
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    reject_if_project_viewer,
    require_project_write_access,
    user_is_project_member,
)
from gigsnano_api.shared.serializers import (
    load_custom_values,
    serialize_stories,
)
from gigsnano_api.webhooks.events import (
    dispatch_event,
    dispatch_sprint_completed_if_transitioned,
)
from gigsnano_api.webhooks.sender import WebhookSender, get_webhook_sender

router = APIRouter(tags=["stories"])
# Workspace-scoped story routes live in their own module but ride this router,
# so the app's include_router list doesn't have to know about the split.
router.include_router(workspace_router)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/",
    response_model=OffsetPageOut[StoryOut],
)
async def list_project_stories(
    q: str | None = None,
    gigsql: str | None = None,
    status: EStoryStatus | None = None,
    status_in: str | None = None,
    priority_in: str | None = None,
    type_in: str | None = None,
    product_only: bool = False,
    unassigned: bool = False,
    unassigned_only: bool = False,
    cycle_id: str | None = None,
    module_id: str | None = None,
    assignee_id: str | None = None,
    label_id: str | None = None,
    target_date_from: str | None = None,
    target_date_to: str | None = None,
    scheduled_only: bool = False,
    order_by: str = "manual",
    limit: int = 50,
    offset: int = 0,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    limit, offset = _clamp_page(limit, offset)
    list_stmt = select(Story).where(Story.project_id == project.id)
    count_stmt = select(func.count(Story.id)).where(Story.project_id == project.id)
    list_stmt, count_stmt = _apply_project_story_filters(
        list_stmt,
        count_stmt,
        identifier=project.identifier,
        product_only=product_only,
        unassigned=unassigned,
        unassigned_only=unassigned_only,
        status=status,
        status_in=status_in,
        priority_in=priority_in,
        type_in=type_in,
        cycle_id=cycle_id,
        module_id=module_id,
        assignee_id=assignee_id,
        label_id=label_id,
        q=q,
        target_date_from=target_date_from,
        target_date_to=target_date_to,
        scheduled_only=scheduled_only,
    )
    list_stmt, count_stmt = _apply_story_gigsql(
        list_stmt, count_stmt, gigsql, ctx.user.id
    )
    list_stmt = list_stmt.order_by(_story_list_order(order_by))
    return await _story_page(db, list_stmt, count_stmt, ctx.workspace.slug, limit, offset)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/resolve/{code}",
    response_model=StoryOut,
)
async def resolve_project_story(
    code: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _, number = _parse_code(code)
    story = (
        await db.execute(
            select(Story).where(Story.project_id == project.id, Story.story_number == number)
        )
    ).scalar_one_or_none()
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No work item '{code}'")
    return await _serialize_one(db, story, ctx.workspace.slug, project.identifier)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/sprint-zero/stories/",
    response_model=list[StoryOut],
)
async def sprint_zero_stories(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    stories = await _project_bmad_stories(db, project.id)
    return await serialize_stories(db, stories, ctx.workspace.slug)



@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/",
    response_model=StoryOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_story(
    payload: CreateStoryPayload,
    background: BackgroundTasks,
    idempotency_key: str | None = None,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    sender: WebhookSender = Depends(get_webhook_sender),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    # Retry-safe create (GIN-368): a repeat with the same idempotency_key replays
    # the first response instead of filing a duplicate work item; a different
    # payload under the same key is a structured conflict.
    fingerprint = request_fingerprint(
        "POST", f"create_story:{project.id}", payload.model_dump(mode="json")
    )
    if idempotency_key:
        replayed = await replay_or_conflict(
            db, ctx.user.id, project.workspace_id, idempotency_key, fingerprint
        )
        if replayed is not None:
            return replayed

    # Reject cross-project FK injection: a cycle/module/parent id must belong to
    # this same project, not just exist anywhere in the workspace/tenant.
    if payload.cycle_id is not None:
        await _get_cycle_or_404(db, project, payload.cycle_id)
    if payload.module_id is not None:
        await _get_module_or_404(db, project, payload.module_id)
    if payload.parent_id is not None:
        await _get_story_or_404(db, project, payload.parent_id)

    await _validate_settings_refs(db, project, payload.model_dump())

    story = await _insert_story(db, project, ctx.user, payload.model_dump())
    if story.assignee_id and story.assignee_id != ctx.user.id:
        if await is_active_project_member(db, project.id, story.assignee_id):
            await resolve_and_notify(
                db,
                project.workspace_id,
                receiver_id=story.assignee_id,
                trigger_key="story.created.assigned",
                context={
                    "actor": ctx.user.display_name,
                    "project": project.name,
                    "story": story.title,
                },
                kind=ENotificationKind.ASSIGNMENT,
                href=_story_notification_href(ctx.workspace.slug, project.id, story),
                triggered_by_id=ctx.user.id,
                project_id=project.id,
                background=background,
                provider=email_provider,
            )
    if story.description:
        await emit_story_mentions(
            db,
            project,
            story,
            ctx.workspace.slug,
            actor_id=ctx.user.id,
            actor_name=ctx.user.display_name,
            text=story.description,
            background=background,
            provider=email_provider,
        )
    await db.commit()
    out = await _serialize_one(db, story, ctx.workspace.slug, project.identifier)
    await dispatch_event(
        db, ctx.workspace.id, ctx.workspace.slug, "story.created",
        out.model_dump(mode="json"), background=background, sender=sender,
    )
    from gigsnano_api.features.automations.dispatcher import run_automations_safe

    await run_automations_safe(
        db, project=project, actor=ctx.user, event="story.created",
        data=out.model_dump(mode="json"), story=story,
    )
    if idempotency_key:
        return await store_idempotent(
            db, ctx.user.id, project.workspace_id, idempotency_key,
            fingerprint, out.model_dump(mode="json"),
        )
    return out


async def _get_accessible_source(
    db: AsyncSession, ctx: WorkspaceContext, source_id: str
) -> tuple[Story, Project]:
    """Resolve a clone source by id within the caller's workspace, enforcing read
    access. A deleted/foreign/inaccessible source is a plain 404 (no disclosure)."""
    source = await db.get(Story, source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source work item not found")
    src_project = await db.get(Project, source.project_id)
    if src_project is None or src_project.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source work item not found")
    if ctx.role not in ADMINS and not await user_is_project_member(db, ctx.user.id, src_project.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source work item not found")
    return source, src_project


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/clone-preview/",
    response_model=ClonePreviewOut,
)
async def clone_preview(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Prefill contract for the duplicate-and-edit form (GIN-357/358): the source's
    copyable values plus which fields copy vs reset. Reads only — no mutation."""
    source, project = route.story, route.project
    custom = await load_custom_values(db, [source.id])
    child_count = (
        await db.execute(select(func.count()).select_from(Story).where(Story.parent_id == source.id))
    ).scalar_one()
    return ClonePreviewOut(
        source_id=source.id,
        source_code=_story_code(project.identifier, source),
        prefill={
            "title": source.title,
            "description": source.description,
            "type": source.type.value,
            "priority": source.priority.value,
            "label_ids": await get_story_label_ids(db, source.id),
            "estimate_id": source.estimate_id,
            "estimate_points": source.estimate_points,
            "module_id": source.module_id,
            "custom_fields": custom.get(source.id, {}),
        },
        copyable_fields=[
            "description", "priority", "labels", "estimate", "module", "custom_fields",
            "parent", "assignee", "cycle", "dates", "relations", "children",
        ],
        reset_fields=RESET_FIELDS,
        child_count=int(child_count or 0),
    )


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/clone/",
    response_model=CloneResultOut,
    status_code=status.HTTP_201_CREATED,
)
async def clone_story(
    payload: CloneStoryRequest,
    idempotency_key: str | None = None,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a work item (optionally its subtree) into this project, independent
    of the source (GIN-355/357/359/360). Transactional; retry-safe via
    idempotency_key. The destination is this URL's project; the source may be in
    another readable project."""
    dest = project
    source, _ = await _get_accessible_source(db, ctx, payload.source_id)

    fingerprint = request_fingerprint("POST", f"clone:{dest.id}", payload.model_dump(mode="json"))
    if idempotency_key:
        replayed = await replay_or_conflict(
            db, ctx.user.id, dest.workspace_id, idempotency_key, fingerprint
        )
        if replayed is not None:
            return replayed

    try:
        summary = await clone_subtree(
            db, source, dest, ctx.user, payload.options, payload.overrides, _insert_story
        )
    except InvalidClone as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(err)) from err

    # Build the response while the ORM objects are still populated (pre-commit),
    # so a post-commit attribute expiry can't trigger a lazy refresh.
    result = CloneResultOut(
        source_id=summary["source_id"],
        root_id=summary["root"].id,
        root_code=_story_code(dest.identifier, summary["root"]),
        created=[
            CloneItemOut(
                source_id=s.cloned_from_id,
                id=s.id,
                code=_story_code(dest.identifier, s),
                title=s.title,
            )
            for s in summary["created"]
        ],
        copied_fields=summary["copied_fields"],
        reset_fields=summary["reset_fields"],
        warnings=summary["warnings"],
    )
    if idempotency_key:
        return await store_idempotent(
            db, ctx.user.id, dest.workspace_id, idempotency_key,
            fingerprint, result.model_dump(mode="json"),
        )
    await db.commit()
    return result


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/",
    response_model=StoryOut,
)
async def get_story(
    workspace_slug: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    return await _serialize_one(db, route.story, workspace_slug, route.project.identifier)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/impact/",
    response_model=ImpactOut,
)
async def get_story_impact(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Grounded impact analysis (GIN-200): affected code (from commit history),
    related work items (relations + module + sub-items), risk, and citations."""
    return await impact_svc.compute_impact(db, route.project, route.story)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/estimate/",
    response_model=EstimateOut,
)
async def get_story_estimate(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Grounded estimate (GIN-201): story points + rationale from blast radius."""
    return await impact_svc.compute_estimate(db, route.project, route.story)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/suggested-dependencies/",
    response_model=list[SuggestedDependencyOut],
)
async def get_story_suggested_dependencies(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Evidence-backed dependency suggestions (GIN-201); FE accepts into StoryRelation."""
    return await impact_svc.suggested_dependencies(db, route.project, route.story)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/preview-update/",
    response_model=UpdatePreviewOut,
)
async def preview_update_story(
    workspace_slug: str,
    payload: UpdateStoryPayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """dry_run for update_story (GIN-368): run the same authorization + validation,
    report which fields would change, and commit no business mutation. Rejects an
    invalid update with the same errors the real PATCH would, so a preview never
    lies about what would happen."""
    story = route.story
    project = route.project
    changes = payload.model_dump(exclude_unset=True)
    changes_json = payload.model_dump(mode="json", exclude_unset=True)

    # The same cross-project FK + reference guards the real update enforces.
    if changes.get("parent_id") is not None:
        await _get_story_or_404(db, project, changes["parent_id"])
    if changes.get("cycle_id") is not None:
        await _get_cycle_or_404(db, project, changes["cycle_id"])
    if changes.get("module_id") is not None:
        await _get_module_or_404(db, project, changes["module_id"])
    await _validate_settings_refs(db, project, changes)
    agent_id = changes.get("ai_agent_id")
    if agent_id is not None and agent_id not in _agent_ids():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown AI agent")
    if (
        story.bmad_workflow is not None
        and story.bmad_is_locked
        and ("status" in changes or "skipped" in changes)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Story is locked by BMAD dependencies")

    changed = [
        f
        for f, v in changes.items()
        if f == "custom_fields" or getattr(story, f, None) != v
    ]
    # Nothing was mutated — only read-only validation selects ran — so the request
    # simply returns without committing; the session is discarded by the dependency.
    return UpdatePreviewOut(
        changed_fields=changed,
        proposed={f: changes_json[f] for f in changed},
        current_updated_at=story.updated_at,
        workspace_slug=workspace_slug,
        project_id=project.id,
        story_id=story.id,
    )


@router.patch(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/",
    response_model=StoryOut,
)
async def update_story(
    workspace_slug: str,
    payload: UpdateStoryPayload,
    background: BackgroundTasks,
    expected_updated_at: str | None = None,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
    sender: WebhookSender = Depends(get_webhook_sender),
    email_provider: EmailProvider = Depends(get_email_provider),
    llm: LLMProvider = Depends(get_llm_provider),
):
    if route.member_ctx is None and route.access.level == EWorkItemAccessLevel.CONTRACTOR:
        blocked = {"assignee_id", "label_id", "label_ids", "estimate_id", "priority"}
        if any(f in payload.model_dump(exclude_unset=True) for f in blocked):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Contractors cannot change assignment fields")
    if route.member_ctx is not None:
        ctx = route.member_ctx
        # update_story resolves project access via require_story_route_access
        # (shared with contractor delegation), not get_project_or_404 — so the
        # write-guard has to be applied here explicitly for real members.
        await reject_if_project_viewer(db, ctx, route.project.id)
    else:
        workspace = await db.get(Workspace, route.project.workspace_id)
        ctx = WorkspaceContext(
            user=route.user,
            workspace=workspace,
            role=EWorkspaceRole.GUEST,
            status=EMemberStatus.ACTIVE,
        )
    story = route.story
    project = route.project
    # Optimistic concurrency (GIN-368): if the caller pinned the version it last
    # read and the row has moved on since, refuse rather than silently overwriting
    # a newer human/agent change.
    assert_unchanged(
        parse_expected_version(expected_updated_at),
        story.updated_at,
        current_state={
            "updated_at": story.updated_at.isoformat(),
            "status": story.status.value,
            "title": story.title,
        },
    )
    old_assignee = story.assignee_id
    was_s0_complete = await sprint_zero_complete(db, project.id)
    changes = payload.model_dump(exclude_unset=True)

    # Reject cross-project FK injection (see create_story). A null value is
    # allowed through — it clears the field — only a non-null id is checked.
    if changes.get("parent_id") is not None:
        await _get_story_or_404(db, project, changes["parent_id"])
    if changes.get("cycle_id") is not None:
        await _get_cycle_or_404(db, project, changes["cycle_id"])
    if changes.get("module_id") is not None:
        await _get_module_or_404(db, project, changes["module_id"])

    # Backdating is for imported work that genuinely predates the import; a
    # future creation date is not a correction, and it would silently drop the
    # item out of every "last N days" window until that date arrived (GIN-527).
    if changes.get("created_at") is not None:
        moment = changes["created_at"]
        if moment.tzinfo is None:
            # A naive value from a client means UTC here, matching the UTC-day
            # contract the date-windowed endpoints are on (GIN-255).
            moment = moment.replace(tzinfo=timezone.utc)
            changes["created_at"] = moment
        if moment > datetime.now(timezone.utc):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "created_at cannot be in the future",
            )

    await _validate_settings_refs(db, project, changes)

    # A non-null ai_agent_id must be a known BMAD roster id (null clears it).
    agent_id = changes.get("ai_agent_id")
    if agent_id is not None and agent_id not in _agent_ids():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown AI agent")
    # Refuse assigning a persona that's already at its concurrent-run capacity (GIN-179).
    if agent_id is not None and agent_id != story.ai_agent_id:
        from gigsnano_api.features.agent_runs.resources import (
            PersonaAtCapacity,
            assert_persona_capacity,
        )

        try:
            await assert_persona_capacity(db, project.workspace_id, agent_id)
        except PersonaAtCapacity:
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Persona {agent_id} is at capacity"
            ) from None

    is_bmad = story.bmad_workflow is not None
    old_readiness = story.bmad_readiness_result if is_bmad else None

    # Server-side unlock enforcement (spec §4): a locked Sprint-0 card cannot
    # be progressed or skipped — the dependency graph is not advisory.
    if is_bmad and story.bmad_is_locked and ("status" in changes or "skipped" in changes):
        raise HTTPException(status.HTTP_409_CONFLICT, "Story is locked by BMAD dependencies")

    # Agentic workflow gate (GIN-220): a matching per-project rule can require an
    # AI-persona review (PASS/CONCERNS/FAIL) or a human role before a status move.
    # The decision is recorded either way; a block persists the audit then 409s.
    if "status" in changes and changes["status"] != story.status:
        from gigsnano_api.features.workflows.gate import evaluate_gate

        decision, allowed = await evaluate_gate(
            db, llm, project, story, changes["status"], actor=ctx.user, actor_role=ctx.role
        )
        if decision is not None and not allowed:
            await db.commit()  # persist the gate decision even though the move is blocked
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Transition blocked by {decision.approver_ref}: {decision.rationale}",
            )

    if is_bmad and "skipped" in changes:
        story.bmad_skipped = bool(changes["skipped"])
    if is_bmad and "readiness_result" in changes:
        story.bmad_readiness_result = changes["readiness_result"]

    # Capture the pre-update description before _apply_story_update overwrites it —
    # the mention-diff below needs the old value. (_apply_story_update's own
    # `activity_old` is local to that helper and not visible here.)
    old_desc = (story.description or "") if "description" in changes else ""

    # Field-setting + per-field story-history activity rows (core DB mutation,
    # shared with the update_work_item agent tool).
    await _apply_story_update(db, story, ctx.user, changes)

    # Custom-field values (GIN-76 slice 2a): applied in the same transaction as
    # the rest of the update, committed together below.
    if payload.custom_fields is not None:
        await apply_custom_field_values(db, project, story, payload.custom_fields)

    if is_bmad:
        bmad_stories = await _project_bmad_stories(db, project.id)
        apply_story_locks(bmad_stories, project.has_ui)

    if is_bmad and "readiness_result" in changes:
        await notify_readiness_transition(
            db,
            project,
            ctx.workspace.slug,
            old=old_readiness,
            new=story.bmad_readiness_result,
            triggered_by_id=ctx.user.id,
            background=background,
            provider=email_provider,
        )

    if changes.get("status") == EStoryStatus.DONE:
        record_activity(
            db,
            project.id,
            EProjectActivityType.STORY,
            ctx.user,
            f"completed story {story.title}",
        )
        await notify_story_watchers(
            db,
            story,
            project,
            project.workspace_id,
            ctx.workspace.slug,
            trigger_key="story.completed",
            context={"actor": ctx.user.display_name, "story": story.title},
            kind=ENotificationKind.SYSTEM,
            actor_id=ctx.user.id,
            background=background,
            provider=email_provider,
        )
        # Marketplace bridge (GIN-185): binding escrow to completion. If this item
        # is a funded gig, advance its contract to DELIVERED so the owner can
        # release escrow. Money never moves here (a contractor can set DONE).
        from gigsnano_api.marketplace.contracts import on_work_item_completed

        await on_work_item_completed(db, story)

    if "description" in changes:
        new_desc = story.description or ""
        old_mentions = await resolve_mention_user_ids(
            db, project.workspace_id, project.id, old_desc or ""
        )
        new_mentions = await resolve_mention_user_ids(
            db, project.workspace_id, project.id, new_desc or ""
        )
        for user_id in new_mentions - old_mentions:
            if user_id == ctx.user.id:
                continue
            await resolve_and_notify(
                db,
                project.workspace_id,
                user_id,
                trigger_key="mention.story",
                context={"actor": ctx.user.display_name, "story": story.title},
                kind=ENotificationKind.MENTION,
                href=_story_notification_href(ctx.workspace.slug, project.id, story),
                triggered_by_id=ctx.user.id,
                project_id=project.id,
                background=background,
                provider=email_provider,
            )

    # Assignment notification: a new, non-self assignee gains this story.
    new_assignee = story.assignee_id
    assignment_changed = (
        "assignee_id" in changes and new_assignee is not None
        and new_assignee != old_assignee and new_assignee != ctx.user.id
    )
    if assignment_changed and await is_active_project_member(db, project.id, new_assignee):
        await resolve_and_notify(
            db,
            project.workspace_id,
            receiver_id=new_assignee,
            trigger_key="story.assigned",
            context={
                "actor": ctx.user.display_name,
                "project": project.name,
                "story": story.title,
                "code": f"{project.identifier}-{story.story_number}",
            },
            kind=ENotificationKind.ASSIGNMENT,
            href=_story_notification_href(ctx.workspace.slug, project.id, story),
            triggered_by_id=ctx.user.id,
            project_id=project.id,
            background=background,
            provider=email_provider,
        )
    # Sprint-0 completion notification (once, on false→true transition).
    if not was_s0_complete and await sprint_zero_complete(db, project.id):
        await notify_project_members(
            db,
            project.workspace_id,
            project.id,
            trigger_key="sprint.zero_complete",
            context={"project": project.name},
            kind=ENotificationKind.SPRINT,
            href=f"/{ctx.workspace.slug}/projects/{project.id}",
            triggered_by_id=ctx.user.id,
            background=background,
            provider=email_provider,
        )

    await db.commit()
    out = await _serialize_one(db, story, ctx.workspace.slug, project.identifier)
    await dispatch_event(
        db, ctx.workspace.id, ctx.workspace.slug, "story.updated",
        out.model_dump(mode="json"), background=background, sender=sender,
    )
    if assignment_changed:
        await dispatch_event(
            db, ctx.workspace.id, ctx.workspace.slug, "story.assigned",
            out.model_dump(mode="json"), background=background, sender=sender,
        )
    await dispatch_sprint_completed_if_transitioned(
        db, project, ctx.workspace.slug, was_s0_complete, background=background, sender=sender,
    )
    from gigsnano_api.features.automations.dispatcher import run_automations_safe

    await run_automations_safe(
        db, project=project, actor=ctx.user, event="story.updated",
        data=out.model_dump(mode="json"), story=story,
    )
    return out



@router.delete("/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/")
async def delete_story(
    story_id: str,
    cascade: EDeleteCascade = EDeleteCascade.DETACH,
    user: User = Depends(get_current_user),
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Soft-delete a work item into the workspace trash (GIN-97). `cascade=children`
    trashes the whole subtree; `detach` (default) trashes only this item and nulls
    its children's parent_id (the historical hard-delete behaviour)."""
    story = await _get_story_or_404(db, project, story_id)
    now = utcnow()
    if cascade == EDeleteCascade.CHILDREN:
        ids = await _collect_subtree_ids(db, project.id, story.id, include_deleted=False)
        await db.execute(
            update(Story)
            .where(Story.id.in_(ids))
            .values(deleted_at=now, deleted_by_id=user.id)
        )
    else:
        await db.execute(
            update(Story).where(Story.parent_id == story.id).values(parent_id=None)
        )
        await db.execute(
            update(Story)
            .where(Story.id == story.id)
            .values(deleted_at=now, deleted_by_id=user.id)
        )
    await db.commit()
    return {"success": True}



@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/restore/",
    response_model=StoryOut,
)
async def restore_story(
    story_id: str,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Restore a trashed item out of the trash. A cascade-deleted subtree comes back
    together (children re-walked via parent_id). If the item's own parent is still
    trashed, it is detached so it returns as a live top-level item."""
    story = await _get_trashed_story_or_404(db, project, story_id)
    ids = await _collect_subtree_ids(db, project.id, story.id, include_deleted=True)
    await db.execute(
        update(Story)
        .where(Story.id.in_(ids), Story.deleted_at.is_not(None))
        .values(deleted_at=None, deleted_by_id=None)
        .execution_options(include_deleted=True)
    )
    if story.parent_id is not None:
        parent = await db.get(
            Story, story.parent_id, execution_options={"include_deleted": True}
        )
        if parent is not None and parent.deleted_at is not None:
            await db.execute(
                update(Story).where(Story.id == story.id).values(parent_id=None)
            )
    await db.commit()
    await db.refresh(story)
    return await _serialize_one(db, story, ctx.workspace.slug, project.identifier)


@router.delete(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/purge/"
)
async def purge_story(
    story_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Permanently delete a trashed item (and its trashed subtree). Irreversible;
    DB FK cascade removes the item's links/relations/comments/etc."""
    story = await _get_trashed_story_or_404(db, project, story_id)
    ids = await _collect_subtree_ids(db, project.id, story.id, include_deleted=True)
    rows = (
        await db.execute(
            select(Story)
            .where(Story.id.in_(ids))
            .execution_options(include_deleted=True)
        )
    ).scalars().all()
    for row in rows:
        await db.delete(row)
    await db.commit()
    return {"success": True}


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/sub-stories/",
    response_model=list[StoryOut],
)
async def sub_stories(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    children = (
        await db.execute(
            select(Story)
            .where(Story.parent_id == story_id, Story.project_id == project.id)
            .order_by(Story.sort_order)
        )
    ).scalars()
    return await serialize_stories(db, list(children.all()), ctx.workspace.slug)


