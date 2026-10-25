from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import (
    document_notification_href,
    emit_document_mentions,
    is_active_project_member,
    resolve_and_notify,
)
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.lib.document_text import (
    attachment_http_error,
    attachment_to_llm_text,
    binary_file_extension,
    is_image_attachment,
    validate_image_attachment,
)
from gigsnano_api.marketplace.deps import StoryRouteAccess, require_story_route_access
from gigsnano_api.models import (
    Artifact,
    ArtifactComment,
    ChatThread,
    EArtifactStatus,
    EMemberStatus,
    ENotificationKind,
    EProjectActivityType,
    Project,
    ProjectMember,
    WorkflowSession,
)
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    get_workspace_context,
    reject_if_project_viewer,
    user_is_project_member,
)

router = APIRouter(tags=["documents"])

# doc_type → frontend EDocumentKind; everything unlisted maps to "other".
KIND_BY_DOC_TYPE = {
    "brief": "brief",
    "prd": "prd",
    "architecture": "architecture",
    "ux": "ux",
    "epics": "epics",
    "research": "research",
}


class DocumentCommentOut(BaseModel):
    """Frontend IDocumentComment. Reads the ORM's `artifact_id` (validation_alias)
    but emits `document_id` on the wire (serialization_alias) — FastAPI serializes
    response models with by_alias=True, so a plain `alias` would leak `artifact_id`."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    document_id: str = Field(validation_alias="artifact_id", serialization_alias="document_id")
    block_index: int
    body: str
    author_name: str
    assignee: str | None
    resolved: bool
    created_at: datetime


class DocumentOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str
    project_name: str
    title: str
    kind: str
    workflow: str | None
    content: str
    comments: list[DocumentCommentOut]
    is_draft: bool
    # Frontend IDocument fields. `source` distinguishes agent-generated
    # artifacts ("agent") from plain user-authored documents ("user"); the
    # frontend keys badge styling off it and crashes if it's absent.
    source: str
    story_id: str | None
    workspace_path: str | None
    file_name: str | None
    mime_type: str | None
    created_at: datetime
    updated_at: datetime


class CreateDocumentPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    project_id: str
    kind: str = "other"
    content: str = ""


class UpdateDocumentPayload(BaseModel):
    title: str | None = None
    content: str | None = None


class AddCommentPayload(BaseModel):
    block_index: int
    body: str = Field(min_length=1)
    assignee: str | None = None
    assignee_user_id: str | None = None


class ResolveCommentPayload(BaseModel):
    resolved: bool


class UploadStoryDocumentPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    project_id: str
    story_id: str
    file_name: str
    mime_type: str
    content: str = ""


def serialize_document(artifact: Artifact, workspace_slug: str, project_name: str) -> DocumentOut:
    return DocumentOut(
        id=artifact.id,
        workspace_slug=workspace_slug,
        project_id=artifact.project_id,
        project_name=project_name,
        title=artifact.title,
        kind=KIND_BY_DOC_TYPE.get(artifact.doc_type, "other"),
        workflow=artifact.source_workflow,
        content=artifact.content_md,
        comments=[DocumentCommentOut.model_validate(c) for c in artifact.comments],
        is_draft=artifact.status == EArtifactStatus.DRAFT,
        # A workflow-generated artifact came from a BMAD agent; anything else is
        # a plain user-authored document (including uploaded reference files).
        source="agent" if artifact.source_workflow else "user",
        story_id=artifact.source_story_id,
        workspace_path=(f"uploads/{artifact.file_name}" if artifact.file_name else None),
        file_name=artifact.file_name,
        mime_type=artifact.mime_type,
        created_at=artifact.created_at,
        updated_at=artifact.updated_at,
    )


async def _artifact_scoped(
    db: AsyncSession, ctx: WorkspaceContext, document_id: str
) -> tuple[Artifact, str]:
    row = (
        await db.execute(
            select(Artifact, Project.name)
            .join(Project, Project.id == Artifact.project_id)
            .options(selectinload(Artifact.comments))
            .where(Artifact.id == document_id, Project.workspace_id == ctx.workspace.id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    artifact, project_name = row
    # Owner/Admin see every document in their workspace (governance, mirrors
    # get_project_or_404). Everyone else must be an active member of the
    # artifact's project — a fellow workspace member is not enough.
    if ctx.role not in ADMINS and not await user_is_project_member(
        db, ctx.user.id, artifact.project_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return artifact, project_name


async def _resolve_comment_assignee_id(
    db: AsyncSession,
    project_id: str,
    *,
    assignee_user_id: str | None,
    assignee: str | None,
) -> str | None:
    if assignee_user_id is not None:
        if not await is_active_project_member(db, project_id, assignee_user_id):
            return None
        return assignee_user_id
    if not assignee:
        return None
    rows = (
        await db.execute(
            select(ProjectMember.user_id, User.display_name)
            .join(User, User.id == ProjectMember.user_id)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).all()
    needle = assignee.strip().lower()
    for user_id, display_name in rows:
        if display_name.strip().lower() == needle:
            return user_id
    return None


@router.get("/workspaces/{workspace_slug}/documents/", response_model=list[DocumentOut])
async def list_documents(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Artifact, Project.name)
        .join(Project, Project.id == Artifact.project_id)
        .options(selectinload(Artifact.comments))
        .where(Project.workspace_id == ctx.workspace.id)
    )
    # Owner/Admin see every project's documents (governance). Everyone else only
    # sees documents in projects they're an active member of.
    if ctx.role not in ADMINS:
        stmt = stmt.join(
            ProjectMember,
            (ProjectMember.project_id == Project.id)
            & (ProjectMember.user_id == ctx.user.id)
            & (ProjectMember.status == EMemberStatus.ACTIVE),
        )
    rows = (await db.execute(stmt.order_by(Artifact.created_at))).all()
    return [serialize_document(a, ctx.workspace.slug, name) for a, name in rows]


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/documents/",
    response_model=list[DocumentOut],
)
async def list_story_documents(
    workspace_slug: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Documents produced from (or attached to) a single story — i.e. artifacts
    whose `source_story_id` is this story. Used by the story agent chat's
    document-reference (`@`-mention) picker."""
    rows = (
        await db.execute(
            select(Artifact, Project.name)
            .join(Project, Project.id == Artifact.project_id)
            .options(selectinload(Artifact.comments))
            .where(
                Artifact.source_story_id == route.story.id,
                Artifact.project_id == route.project.id,
            )
            .order_by(Artifact.created_at)
        )
    ).all()
    return [serialize_document(a, workspace_slug, name) for a, name in rows]


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/documents/",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_story_document(
    workspace_slug: str,
    payload: UploadStoryDocumentPayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    if route.member_ctx is not None:
        await reject_if_project_viewer(db, route.member_ctx, route.project.id)
    # Never build a path from the client-supplied name — keep the basename only.
    file_name = payload.file_name.replace("\\", "/").rsplit("/", 1)[-1] or payload.file_name
    content_md = payload.content
    if is_image_attachment(file_name=file_name, mime_type=payload.mime_type):
        # Validate magic bytes/size/type, then store the base64 verbatim so the
        # web app renders it inline (GIN-310). Bytes are not text-extractable.
        try:
            validate_image_attachment(
                file_name=file_name,
                mime_type=payload.mime_type,
                content=payload.content,
            )
        except Exception as exc:
            raise attachment_http_error(exc) from exc
    elif binary_file_extension(file_name=file_name, mime_type=payload.mime_type):
        try:
            content_md = attachment_to_llm_text(
                file_name=file_name,
                mime_type=payload.mime_type,
                content=payload.content,
            )
        except Exception as exc:
            raise attachment_http_error(exc) from exc
    elif not content_md.strip():
        content_md = f"# {payload.title}\n\nUploaded reference file."

    artifact = Artifact(
        project_id=route.project.id,
        doc_type="other",
        source_workflow=None,
        title=payload.title,
        content_md=content_md.strip() or f"# {payload.title}\n\nUploaded reference file.",
        status=EArtifactStatus.FINAL,
        source_story_id=route.story.id,
        file_name=file_name,
        mime_type=payload.mime_type,
    )
    db.add(artifact)
    await db.commit()
    set_committed_value(artifact, "comments", [])
    return serialize_document(artifact, workspace_slug, route.project.name)


@router.post(
    "/workspaces/{workspace_slug}/documents/",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_document(
    payload: CreateDocumentPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, payload.project_id)
    if project is None or project.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if ctx.role not in ADMINS and not await user_is_project_member(db, ctx.user.id, project.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    await reject_if_project_viewer(db, ctx, project.id)
    artifact = Artifact(
        project_id=project.id,
        doc_type=payload.kind if payload.kind in KIND_BY_DOC_TYPE else "other",
        title=payload.title,
        content_md=payload.content,
        status=EArtifactStatus.FINAL,  # user-authored docs are immediately final
    )
    db.add(artifact)
    await db.commit()
    # fresh artifact, no comments yet — set the committed value directly so
    # serialize_document's `artifact.comments` read doesn't trigger an async
    # lazy-load (plain assignment still fires the loader to diff old/new).
    set_committed_value(artifact, "comments", [])
    return serialize_document(artifact, ctx.workspace.slug, project.name)


@router.get("/workspaces/{workspace_slug}/documents/{document_id}/", response_model=DocumentOut)
async def get_document(
    document_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    artifact, project_name = await _artifact_scoped(db, ctx, document_id)
    return serialize_document(artifact, ctx.workspace.slug, project_name)


@router.patch("/workspaces/{workspace_slug}/documents/{document_id}/", response_model=DocumentOut)
async def update_document(
    document_id: str,
    payload: UpdateDocumentPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    artifact, project_name = await _artifact_scoped(db, ctx, document_id)
    await reject_if_project_viewer(db, ctx, artifact.project_id)
    if payload.title is not None:
        artifact.title = payload.title
    if payload.content is not None:
        artifact.content_md = payload.content
    await db.commit()
    return serialize_document(artifact, ctx.workspace.slug, project_name)


async def _delete_artifact(
    db: AsyncSession, ctx: WorkspaceContext, artifact: Artifact, document_id: str
) -> dict:
    """Shared deletion: permission, agent-doc guard, reference cleanup, audit.

    Both the workspace-scoped and work-item-scoped routes land here so the guards
    and the audit entry cannot drift apart between them.
    """
    await reject_if_project_viewer(db, ctx, artifact.project_id)
    if artifact.source_workflow is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Agent documents cannot be deleted.")
    # Strip the deleted id from any WorkflowSession.context_artifact_ids JSON list
    # (not an FK, so nothing cleans it). Context artifacts are gathered per-project,
    # so scope the scan to this artifact's project rather than every tenant's sessions.
    sessions = (
        (
            await db.execute(
                select(WorkflowSession)
                .join(ChatThread, ChatThread.id == WorkflowSession.thread_id)
                .where(ChatThread.project_id == artifact.project_id)
            )
        )
        .scalars()
        .all()
    )
    for s in sessions:
        if document_id in (s.context_artifact_ids or []):
            s.context_artifact_ids = [a for a in s.context_artifact_ids if a != document_id]

    # Audit before the row goes: the name and size are needed for the entry, and
    # never the contents (GIN-402 — audit records must not retain file data).
    file_name = artifact.file_name or artifact.title
    byte_size = len(artifact.content_md or "")
    record_activity(
        db,
        artifact.project_id,
        EProjectActivityType.STORY,
        ctx.user,
        f"deleted attachment '{file_name}' ({byte_size} bytes)",
    )

    await db.delete(artifact)  # comments cascade
    await db.commit()
    return {"success": True}


@router.delete("/workspaces/{workspace_slug}/documents/{document_id}/")
async def delete_document(
    document_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    artifact, _name = await _artifact_scoped(db, ctx, document_id)  # 404 if out of scope
    return await _delete_artifact(db, ctx, artifact, document_id)


@router.delete(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/documents/"
    "{document_id}/"
)
async def delete_story_document(
    document_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Delete an attachment through its work item, verifying it actually belongs
    to that item. The workspace-scoped route above only proves the document is in
    an accessible project, so an id from a *different* work item would delete
    successfully — this route is what makes that a 404 (GIN-402 AC7).

    404, not 403, for a mismatch: confirming the attachment exists elsewhere would
    leak it.
    """
    artifact = await db.get(Artifact, document_id)
    if (
        artifact is None
        or artifact.project_id != route.project.id
        or artifact.source_story_id != route.story.id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return await _delete_artifact(db, ctx, artifact, document_id)


@router.post(
    "/workspaces/{workspace_slug}/documents/{document_id}/comments/",
    response_model=DocumentCommentOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    document_id: str,
    payload: AddCommentPayload,
    background: BackgroundTasks,
    # Commenting is excluded from the Viewer write-guard (matches the story
    # comment policy — collaboration, not a document-content mutation).
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    artifact, _ = await _artifact_scoped(db, ctx, document_id)
    project = await db.get(Project, artifact.project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    assignee_user_id = await _resolve_comment_assignee_id(
        db,
        project.id,
        assignee_user_id=payload.assignee_user_id,
        assignee=payload.assignee,
    )
    comment = ArtifactComment(
        artifact_id=artifact.id,
        block_index=payload.block_index,
        body=payload.body,
        author_name=ctx.user.display_name,
        assignee=payload.assignee,
        assignee_user_id=assignee_user_id,
    )
    db.add(comment)
    await db.flush()
    await emit_document_mentions(
        db,
        project,
        document_id=artifact.id,
        document_title=artifact.title,
        workspace_slug=ctx.workspace.slug,
        actor_id=ctx.user.id,
        actor_name=ctx.user.display_name,
        text=payload.body,
        background=background,
        provider=email_provider,
    )
    if assignee_user_id and assignee_user_id != ctx.user.id:
        await resolve_and_notify(
            db,
            ctx.workspace.id,
            assignee_user_id,
            trigger_key="document.comment.assigned",
            context={
                "actor": ctx.user.display_name,
                "document": artifact.title,
            },
            kind=ENotificationKind.ASSIGNMENT,
            href=document_notification_href(ctx.workspace.slug, artifact.id),
            triggered_by_id=ctx.user.id,
            project_id=project.id,
            background=background,
            provider=email_provider,
        )
    await db.commit()
    return DocumentCommentOut.model_validate(comment)


@router.patch(
    "/workspaces/{workspace_slug}/documents/{document_id}/comments/{comment_id}/",
    response_model=DocumentCommentOut,
)
async def resolve_comment(
    document_id: str,
    comment_id: str,
    payload: ResolveCommentPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    artifact, _ = await _artifact_scoped(db, ctx, document_id)
    await reject_if_project_viewer(db, ctx, artifact.project_id)
    comment = (
        await db.execute(
            select(ArtifactComment).where(
                ArtifactComment.id == comment_id, ArtifactComment.artifact_id == artifact.id
            )
        )
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    comment.resolved = payload.resolved
    await db.commit()
    return DocumentCommentOut.model_validate(comment)
