from datetime import timedelta, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.bmad.blueprint import steps_for
from gigsnano_api.bmad.unlock import apply_story_locks
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.messages import project_transfer_email
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.email.send import send_email_in_background
from gigsnano_api.features.projects.schemas import (
    CreateProjectPayload,
    ProjectOut,
    TransferProjectPayload,
    TransferRequestOut,
    UpdateProjectPayload,
)
from gigsnano_api.features.solutions.definitions import (
    SOFTWARE_DELIVERY_KEY,
    SOFTWARE_DELIVERY_VERSION,
)
from gigsnano_api.features.stories.schemas import ActivityOut
from gigsnano_api.models import (
    Cycle,
    Delegation,
    ECloneStatus,
    ECycleStatus,
    EMemberStatus,
    EProjectActivityType,
    EProjectFlow,
    EProjectRole,
    EStateGroup,
    ETransferStatus,
    EWorkspaceRole,
    GitHubConnection,
    Project,
    ProjectActivity,
    ProjectFeature,
    ProjectMember,
    ProjectState,
    ProjectTransferRequest,
    Story,
    StoryDraft,
    Workspace,
    WorkspaceMember,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_permission,
    require_role,
)
from gigsnano_api.shared.project_rbac import EProjectPermission
from gigsnano_api.shared.serializers import serialize_project, serialize_projects
from gigsnano_api.sync.github_oauth import (
    FakeGitHubOAuth,
    GitHubOAuth,
    GitHubOAuthError,
    decrypt_token,
    get_github_oauth,
)
from gigsnano_api.workspace.clone import run_clone_in_fresh_session

router = APIRouter(tags=["projects"])

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


class ProjectByRepoOut(BaseModel):
    workspace_slug: str
    project_id: str
    identifier: str


@router.get("/projects/by-repo", response_model=ProjectByRepoOut)
async def project_by_repo(
    full_name: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """First project the caller (an active member of its workspace) can access
    whose `repo_full_name` matches `full_name`, case-insensitive. Used by the
    MCP client to bind a local git repo to a GigsNano project.
    """
    row = (
        await db.execute(
            select(Project, Workspace.slug)
            .join(Workspace, Workspace.id == Project.workspace_id)
            .join(
                WorkspaceMember,
                (WorkspaceMember.workspace_id == Workspace.id)
                & (WorkspaceMember.user_id == user.id)
                & (WorkspaceMember.status == EMemberStatus.ACTIVE),
            )
            .outerjoin(
                ProjectMember,
                (ProjectMember.project_id == Project.id)
                & (ProjectMember.user_id == user.id)
                & (ProjectMember.status == EMemberStatus.ACTIVE),
            )
            .where(
                func.lower(Project.repo_full_name) == full_name.lower(),
                ProjectMember.id.isnot(None) | WorkspaceMember.role.in_(ADMINS),
            )
            .order_by(Project.created_at)
        )
    ).first()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"No accessible project for repo '{full_name}'"
        )
    project, slug = row
    return ProjectByRepoOut(workspace_slug=slug, project_id=project.id, identifier=project.identifier)


async def _oauth_token_for(db: AsyncSession, workspace_id: str) -> str | None:
    """Decrypted GitHub OAuth token for the workspace connection, or None."""
    conn = (
        await db.execute(
            select(GitHubConnection).where(GitHubConnection.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()
    if conn is None or not conn.access_token_encrypted:
        return None
    return decrypt_token(conn.access_token_encrypted)


def record_activity(
    db: AsyncSession,
    project_id: str,
    type_: EProjectActivityType,
    actor: User,
    action: str,
) -> None:
    """Queue an activity row on the session; caller commits."""
    db.add(
        ProjectActivity(
            project_id=project_id,
            type=type_,
            actor_name=actor.display_name,
            actor_avatar_url=actor.avatar_url,
            action=action,
        )
    )


# Autosave PATCHes the description every few seconds while the user types; without
# coalescing that floods the activity feed with one "updated the description" row
# per keystroke-burst (GIN-11). Jira/Plane/Linear collapse a single editing session
# into one entry, so fold consecutive description edits by the same actor within
# this window into the existing row (bump its timestamp) instead of appending.
# ponytail: actor identity is the display_name (the row has no actor_id); a same-named
# collision inside one project within the window is negligible.
DESCRIPTION_COALESCE_WINDOW = timedelta(minutes=10)


async def record_description_edit(db: AsyncSession, project_id: str, actor: User) -> None:
    latest = (
        await db.execute(
            select(ProjectActivity)
            .where(ProjectActivity.project_id == project_id)
            .order_by(ProjectActivity.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    now = utcnow()
    # SQLite hands back a naive created_at; Postgres a tz-aware one. Normalize to
    # UTC so the window arithmetic works regardless of backend.
    last_at = latest.created_at if latest is not None else None
    if last_at is not None and last_at.tzinfo is None:
        last_at = last_at.replace(tzinfo=timezone.utc)
    if (
        latest is not None
        and latest.type == EProjectActivityType.DESCRIPTION
        and latest.actor_name == actor.display_name
        and now - last_at <= DESCRIPTION_COALESCE_WINDOW
    ):
        latest.created_at = now  # refresh the session's entry, no new row
        return
    record_activity(
        db, project_id, EProjectActivityType.DESCRIPTION, actor, "updated the project description"
    )


async def seed_sprint_zero(db: AsyncSession, project: Project) -> Cycle:
    """Create the Sprint-0 cycle + blueprint stories with locks applied. No commit."""
    cycle = Cycle(
        project_id=project.id,
        name="Sprint 0",
        description="BMAD planning sprint — generated at project creation.",
        status=ECycleStatus.ACTIVE,
        is_sprint_zero=True,
    )
    db.add(cycle)
    await db.flush()  # assign cycle.id before it's used as the stories' FK below
    stories = [
        Story(
            project_id=project.id,
            cycle_id=cycle.id,
            title=step.title,
            description=step.description,
            sort_order=i,
            story_number=i + 1,
            bmad_workflow=step.workflow,
            bmad_agent=step.agent,
            bmad_artifact=step.artifact,
            bmad_is_required=step.required,
        )
        for i, step in enumerate(steps_for(project.flow, project.has_ui))
    ]
    apply_story_locks(stories, project.has_ui)
    db.add_all(stories)
    return cycle


async def seed_project_settings(db: AsyncSession, project: Project) -> None:
    """Default features + workflow states at project creation (matches the frontend mock). No commit."""
    features = [
        ("cycles", "Cycles", "Time-boxed sprints for delivery after Sprint-0.", True),
        ("modules", "Modules", "Group stories into feature areas across sprints.", True),
        ("views", "Views", "Saved board, list, and table filters.", True),
        ("pages", "Pages", "Wiki-style project documentation (coming soon).", False),
    ]
    for key, name, description, enabled in features:
        db.add(ProjectFeature(project_id=project.id, key=key, name=name,
                              description=description, enabled=enabled))
    states = [
        ("Backlog", "#94a3b8", EStateGroup.BACKLOG),
        ("Todo", "#64748b", EStateGroup.UNSTARTED),
        ("In progress", "#3b82f6", EStateGroup.STARTED),
        ("In review", "#8b5cf6", EStateGroup.STARTED),
        ("Done", "#22c55e", EStateGroup.COMPLETED),
    ]
    for order, (name, color, group) in enumerate(states):
        db.add(ProjectState(project_id=project.id, name=name, color=color,
                            group=group, sort_order=order))


@router.get("/workspaces/{workspace_slug}/projects/", response_model=list[ProjectOut])
async def list_projects(
    include_all: bool = Query(False, alias="all"),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Project)
        .where(Project.workspace_id == ctx.workspace.id)
        .order_by(Project.created_at)
    )
    # Owner/Admin may request the full workspace view; everyone else (and admins by
    # default) see only projects they're an active member of.
    if not (include_all and ctx.role in ADMINS):
        stmt = stmt.join(ProjectMember, ProjectMember.project_id == Project.id).where(
            ProjectMember.user_id == ctx.user.id,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    projects = (await db.execute(stmt)).scalars().all()
    return await serialize_projects(db, list(projects), ctx.workspace.slug)


@router.post(
    "/workspaces/{workspace_slug}/projects/",
    response_model=ProjectOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    payload: CreateProjectPayload,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
):
    if await _identifier_clash(db, ctx.workspace.id, payload.identifier):
        _raise_identifier_taken(payload.identifier)

    fields = payload.model_dump(exclude_none=True, exclude={"repo_full_name", "template_id", "blank"})
    project = Project(
        workspace_id=ctx.workspace.id,
        lead_id=ctx.user.id,
        solution_key=SOFTWARE_DELIVERY_KEY,
        solution_version=SOFTWARE_DELIVERY_VERSION,
        **fields,
    )
    db.add(project)
    await db.flush()

    # The creator is the project OWNER (GIN-318): they get full project authority
    # (transfer/delete) at the project level, not only via workspace governance.
    db.add(
        ProjectMember(project_id=project.id, user_id=ctx.user.id, role=EProjectRole.OWNER)
    )
    if not payload.blank:
        await seed_sprint_zero(db, project)
    await seed_project_settings(db, project)

    # Project template (GIN-239): seed the Foundation on top of the default config.
    if payload.template_id:
        from gigsnano_api.features.templates.service import apply_project_template, get_template

        template = await get_template(db, payload.template_id, ctx.workspace.id)
        if template is not None and template.kind == "project":
            try:
                await apply_project_template(db, template.content, project)
            except (ValueError, KeyError) as e:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Template apply failed: {e}") from None
    record_activity(
        db, project.id, EProjectActivityType.CREATED, ctx.user, "created the project"
    )

    schedule_clone = False
    if payload.flow == EProjectFlow.EXISTING and payload.repo_full_name:
        token = await _oauth_token_for(db, ctx.workspace.id)
        repos = {}
        if token is not None or isinstance(oauth, FakeGitHubOAuth):
            # Repo resolution degrades gracefully, like the clone itself: a
            # GitHub blip/rate-limit here must not roll back project creation.
            try:
                repos = {r.full_name: r for r in await oauth.list_repos(token or "")}
            except (GitHubOAuthError, httpx.HTTPError):
                repos = {}
        repo = repos.get(payload.repo_full_name)
        if repo is not None:
            project.repo_full_name = repo.full_name
            project.repo_url = repo.url
            project.repo_default_branch = repo.default_branch
            project.clone_status = ECloneStatus.PENDING
            schedule_clone = True

    await db.commit()
    if schedule_clone:
        background.add_task(run_clone_in_fresh_session, oauth, project.id)
    return await serialize_project(db, project, ctx.workspace.slug)


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/", response_model=ProjectOut)
async def get_project(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await serialize_project(db, project, ctx.workspace.slug)


async def _validate_update(db: AsyncSession, project: Project, changes: dict) -> None:
    """Reject an invalid lead or date pair before anything is written (GIN-487)."""
    # A new lead must already be an active member of THIS project — we never add
    # them as a side effect. Clearing the lead (explicit null) needs no check.
    if changes.get("lead_id"):
        is_member = (await db.execute(
            select(ProjectMember.id).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == changes["lead_id"],
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )).first()
        if is_member is None:
            raise HTTPException(400, "Lead must be an active member of this project")

    # Validate the effective (post-patch) pair, so moving one date can't leave the
    # project with target < start.
    new_identifier = changes.get("identifier")
    if (
        new_identifier
        and new_identifier != project.identifier
        and await _identifier_clash(db, project.workspace_id, new_identifier)
    ):
        _raise_identifier_taken(new_identifier)

    start = changes.get("start_date") or project.start_date
    target = changes.get("target_date") or project.target_date
    if start and target and target < start:
        raise HTTPException(400, "Target date must be on or after the start date")


@router.patch("/workspaces/{workspace_slug}/projects/{project_id}/", response_model=ProjectOut)
async def update_project(
    payload: UpdateProjectPayload,
    # Editing project metadata/settings is admin+ (GIN-318): a Member delivers work,
    # it does not reconfigure the project. Server-enforced, not just UI-hidden.
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    changes = payload.model_dump(exclude_unset=True)
    await _validate_update(db, project, changes)
    # Planning method (GIN-330) is handled apart from the generic field loop so it
    # can stamp an effective timestamp and its own audit line, and never silently
    # rewrite historical estimates (only the go-forward method changes).
    new_method = changes.pop("planning_method", None)
    # Capture whether the prose actually changed BEFORE overwriting — autosave
    # re-PATCHes an unchanged overview constantly; a no-op edit must log nothing.
    prose_fields = ("overview", "description")
    prose_changed = any(f in changes and getattr(project, f) != changes[f] for f in prose_fields)
    for field, value in changes.items():
        setattr(project, field, value)

    method_changed = new_method is not None and new_method != project.planning_method
    if method_changed:
        project.planning_method = new_method
        project.planning_method_updated_at = utcnow()
        record_activity(
            db, project.id, EProjectActivityType.UPDATED, ctx.user,
            f"set planning method to {new_method.value}",
        )

    if "has_ui" in changes:
        # The UX card's unlock (and every downstream lock that depends on it)
        # is derived from has_ui — recompute the whole Sprint-0 chain, mirroring
        # seeding and per-story updates (see stories.py update_story).
        bmad_stories = (
            await db.execute(
                select(Story)
                .where(Story.project_id == project.id, Story.bmad_workflow.is_not(None))
                .order_by(Story.sort_order)
            )
        ).scalars().all()
        apply_story_locks(list(bmad_stories), project.has_ui)

    if changes:
        # Pure prose edits coalesce into one "description" entry per editing session
        # and skip no-op autosaves; anything else (or mixed) logs "updated" per PATCH.
        prose_only = set(changes) <= set(prose_fields)
        if prose_only:
            if prose_changed:
                await record_description_edit(db, project.id, ctx.user)
        else:
            record_activity(
                db, project.id, EProjectActivityType.UPDATED, ctx.user, "updated the project"
            )
    await db.commit()
    return await serialize_project(db, project, ctx.workspace.slug)


async def _dest_owner(db: AsyncSession, dest: Workspace) -> User | None:
    """The destination workspace's active OWNER — the transfer is emailed to them."""
    return (
        await db.execute(
            select(User)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(
                WorkspaceMember.workspace_id == dest.id,
                WorkspaceMember.role == EWorkspaceRole.OWNER,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalars().first()


def _raise_identifier_taken(identifier: str) -> None:
    # Codes are unique per workspace only; other workspaces never clash.
    raise HTTPException(
        status.HTTP_409_CONFLICT,
        f'Project code "{identifier}" is already used by another project in this '
        "workspace. Choose a different code.",
    )


async def _identifier_clash(db: AsyncSession, dest_id: str, identifier: str) -> bool:
    """Identifier is unique per workspace — a clash would violate the constraint."""
    return (
        await db.execute(
            select(Project.id).where(
                Project.workspace_id == dest_id, Project.identifier == identifier
            )
        )
    ).scalar_one_or_none() is not None


async def _execute_transfer(
    db: AsyncSession, project: Project, dest: Workspace, actor: User, source_slug: str
) -> None:
    """Reassign the project's workspace FK and bump the two tables that denormalize
    workspace_id (story drafts, agent delegations). Cycles/modules/stories/members/
    labels/states FK to the project and follow for free. Caller commits."""
    project.workspace_id = dest.id
    for model in (StoryDraft, Delegation):
        await db.execute(
            update(model).where(model.project_id == project.id).values(workspace_id=dest.id)
        )
    record_activity(
        db,
        project.id,
        EProjectActivityType.UPDATED,
        actor,
        f"transferred the project from {source_slug} to {dest.slug}",
    )


async def _serialize_transfer_request(
    db: AsyncSession, req: ProjectTransferRequest
) -> TransferRequestOut:
    project = await db.get(Project, req.project_id)
    source = await db.get(Workspace, req.source_workspace_id)
    dest = await db.get(Workspace, req.dest_workspace_id)
    return TransferRequestOut(
        id=req.id,
        project_id=req.project_id,
        project_name=project.name if project else "",
        project_identifier=project.identifier if project else "",
        source_workspace_slug=source.slug if source else "",
        source_workspace_name=source.name if source else "",
        dest_workspace_slug=dest.slug if dest else "",
        dest_workspace_name=dest.name if dest else "",
        invited_email=req.invited_email,
        status=req.status.value,
        created_at=req.created_at,
    )


async def _load_pending_for_actor(
    db: AsyncSession, token: str, user: User
) -> ProjectTransferRequest:
    """A PENDING request by token, bound to the invited destination-owner email so a
    leaked token can't be redeemed by an unrelated account (mirrors invitations)."""
    req = (
        await db.execute(
            select(ProjectTransferRequest).where(ProjectTransferRequest.token == token)
        )
    ).scalar_one_or_none()
    if req is None or req.status != ETransferStatus.PENDING:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired transfer request")
    if req.invited_email.lower() != user.email.lower():
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This transfer was sent to a different account"
        )
    return req


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/transfer/",
    response_model=TransferRequestOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_project_transfer(
    payload: TransferProjectPayload,
    background: BackgroundTasks,
    project: Project = Depends(get_project_or_404),
    # Admin/owner in the SOURCE workspace (require_role shares get_project_or_404's ctx).
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
) -> TransferRequestOut:
    """Start a GitHub-style transfer: the source admin names ANY destination
    workspace by slug; the destination's OWNER is emailed an accept link. Nothing
    moves until they accept — the initiator need not belong to the destination
    (GIN-85). One pending transfer per project at a time.
    """
    dest = (
        await db.execute(
            select(Workspace).where(Workspace.slug == payload.destination_workspace_slug)
        )
    ).scalar_one_or_none()
    if dest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Destination workspace not found")
    if dest.id == project.workspace_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project is already in this workspace")

    if await _identifier_clash(db, dest.id, project.identifier):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Identifier '{project.identifier}' already exists in {dest.name} — "
            "rename this project's identifier first, then transfer.",
        )

    existing = (
        await db.execute(
            select(ProjectTransferRequest).where(
                ProjectTransferRequest.project_id == project.id,
                ProjectTransferRequest.status == ETransferStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A transfer for this project is already pending"
        )

    owner = await _dest_owner(db, dest)
    if owner is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"{dest.name} has no owner to approve the transfer"
        )

    req = ProjectTransferRequest(
        project_id=project.id,
        source_workspace_id=project.workspace_id,
        dest_workspace_id=dest.id,
        invited_email=owner.email,
        created_by_id=ctx.user.id,
    )
    db.add(req)
    await db.flush()

    link = f"{settings.app_base_url}/transfer-requests/{req.token}"
    subject, html = project_transfer_email(project.name, ctx.workspace.name, dest.name, link)
    background.add_task(send_email_in_background, provider, owner.email, subject, html)

    record_activity(
        db,
        project.id,
        EProjectActivityType.UPDATED,
        ctx.user,
        f"requested a transfer to {dest.name}",
    )
    await db.commit()
    return await _serialize_transfer_request(db, req)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/transfer/",
    response_model=TransferRequestOut | None,
)
async def get_pending_transfer(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
) -> TransferRequestOut | None:
    """The project's current pending transfer (for the source-side banner), or null."""
    req = (
        await db.execute(
            select(ProjectTransferRequest).where(
                ProjectTransferRequest.project_id == project.id,
                ProjectTransferRequest.status == ETransferStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    return await _serialize_transfer_request(db, req) if req else None


@router.delete(
    "/workspaces/{workspace_slug}/projects/{project_id}/transfer/",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_transfer(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Source admin cancels the pending transfer before the owner accepts."""
    req = (
        await db.execute(
            select(ProjectTransferRequest).where(
                ProjectTransferRequest.project_id == project.id,
                ProjectTransferRequest.status == ETransferStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No pending transfer")
    req.status = ETransferStatus.CANCELLED
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user, "cancelled the transfer request"
    )
    await db.commit()


@router.get("/auth/transfer-requests/{token}/", response_model=TransferRequestOut)
async def get_transfer_request(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TransferRequestOut:
    """Details for the destination owner's accept page."""
    req = await _load_pending_for_actor(db, token, user)
    return await _serialize_transfer_request(db, req)


@router.post("/auth/transfer-requests/{token}/accept/", response_model=ProjectOut)
async def accept_transfer_request(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectOut:
    """The destination owner accepts — the project moves into their workspace."""
    req = await _load_pending_for_actor(db, token, user)
    project = await db.get(Project, req.project_id)
    dest = await db.get(Workspace, req.dest_workspace_id)
    source = await db.get(Workspace, req.source_workspace_id)
    if project is None or dest is None or source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project or workspace no longer exists")
    # The project may have moved or been renamed since the request; re-check.
    if project.workspace_id != req.source_workspace_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This project has already moved")
    if await _identifier_clash(db, dest.id, project.identifier):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Identifier '{project.identifier}' already exists in {dest.name} — "
            "the transfer can't complete until it's renamed.",
        )
    await _execute_transfer(db, project, dest, user, source.slug)
    # The accepting owner joins the project so it's visible/accessible in its new
    # home (mirrors create_project adding the creator as a project ADMIN). Source
    # project members lose access for free — they aren't members of `dest`.
    already_member = await db.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project.id, ProjectMember.user_id == user.id
        )
    )
    if already_member.scalar_one_or_none() is None:
        db.add(
            ProjectMember(
                project_id=project.id, user_id=user.id, role=EProjectRole.ADMIN
            )
        )
    req.status = ETransferStatus.ACCEPTED
    await db.commit()
    return await serialize_project(db, project, dest.slug)


@router.post("/auth/transfer-requests/{token}/decline/")
async def decline_transfer_request(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """The destination owner declines — nothing moves."""
    req = await _load_pending_for_actor(db, token, user)
    req.status = ETransferStatus.DECLINED
    record_activity(
        db, req.project_id, EProjectActivityType.UPDATED, user, "declined the transfer request"
    )
    await db.commit()
    return {"status": "declined"}


@router.delete("/workspaces/{workspace_slug}/projects/{project_id}/")
async def delete_project(
    # Danger zone: project OWNER only (or workspace Owner/Admin governance) — GIN-318.
    project: Project = Depends(require_project_permission(EProjectPermission.DELETE_PROJECT)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    await db.delete(project)  # cycles/modules/stories/members/activity cascade
    await db.commit()
    return {"success": True}


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/activity/",
    response_model=list[ActivityOut],
)
async def project_activity(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(ProjectActivity)
            .where(ProjectActivity.project_id == project.id)
            .order_by(ProjectActivity.created_at.desc())
        )
    ).scalars()
    return list(rows.all())
