"""Story detail sub-resources: links, relations, comments, history, subscribe.
Frontend contract: src/types/story/story-detail.ts + src/services/story/story-detail.service.ts.
All routes are workspace/project/story scoped; every create writes a StoryActivity row so
the history feed stays in sync (the frontend invalidates history on those mutations)."""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from gigsnano_api.content.fields import build_content, parse_content_format
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.mutations import replay_or_conflict, store_idempotent
from gigsnano_api.features.notifications.router import emit_story_mentions, notify_story_watchers
from gigsnano_api.features.stories.activity import record_story_activity
from gigsnano_api.features.stories.service import _get_story_or_404
from gigsnano_api.models import (
    ENotificationKind,
    EStoryActivityField,
    EStoryActivityKind,
    EStoryRelationType,
    Project,
    Story,
    StoryActivity,
    StoryComment,
    StoryLink,
    StoryRelation,
    StorySubscription,
    TimeEntry,
)
from gigsnano_api.models.idempotency import request_fingerprint
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["story-detail"])

_BASE = "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}"


# ─────────────────────────── Links ───────────────────────────


class StoryLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    story_id: str
    title: str
    url: str
    created_by_id: str | None
    created_by_name: str
    created_at: datetime


class CreateStoryLinkPayload(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(min_length=1, max_length=2000)


class UpdateStoryLinkPayload(BaseModel):
    title: str | None = None
    url: str | None = None


@router.get(f"{_BASE}/links/", response_model=list[StoryLinkOut])
async def list_links(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    rows = (
        await db.execute(
            select(StoryLink).where(StoryLink.story_id == story_id).order_by(StoryLink.created_at)
        )
    ).scalars().all()
    return list(rows)


@router.post(f"{_BASE}/links/", response_model=StoryLinkOut, status_code=status.HTTP_201_CREATED)
async def create_link(
    story_id: str,
    payload: CreateStoryLinkPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    link = StoryLink(
        story_id=story_id,
        title=payload.title.strip(),
        url=payload.url.strip(),
        created_by_id=ctx.user.id,
        created_by_name=ctx.user.display_name,
    )
    db.add(link)
    record_story_activity(
        db, story_id, ctx.user,
        kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.LINK,
        summary=f"added link {link.title}", new_value=link.url,
    )
    await db.commit()
    return link


async def _link_or_404(db: AsyncSession, story_id: str, link_id: str) -> StoryLink:
    link = (
        await db.execute(
            select(StoryLink).where(StoryLink.id == link_id, StoryLink.story_id == story_id)
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")
    return link


@router.patch(f"{_BASE}/links/{{link_id}}/", response_model=StoryLinkOut)
async def update_link(
    story_id: str,
    link_id: str,
    payload: UpdateStoryLinkPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    link = await _link_or_404(db, story_id, link_id)
    if payload.title is not None and payload.title.strip():
        link.title = payload.title.strip()
    if payload.url is not None and payload.url.strip():
        link.url = payload.url.strip()
    await db.commit()
    return link


@router.delete(f"{_BASE}/links/{{link_id}}/")
async def delete_link(
    story_id: str,
    link_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    link = await _link_or_404(db, story_id, link_id)
    await db.delete(link)
    await db.commit()
    return {"success": True}


# ─────────────────────────── Relations ───────────────────────────


class StoryRelationOut(BaseModel):
    id: str
    story_id: str
    related_story_id: str
    relation_type: EStoryRelationType
    related_story_title: str
    related_story_key: str
    created_at: datetime


class CreateStoryRelationPayload(BaseModel):
    relation_type: EStoryRelationType
    related_story_id: str


def _relation_out(rel: StoryRelation, related: Story, identifier: str) -> StoryRelationOut:
    return StoryRelationOut(
        id=rel.id,
        story_id=rel.story_id,
        related_story_id=rel.related_story_id,
        relation_type=rel.relation_type,
        related_story_title=related.title,
        related_story_key=f"{identifier}-{related.sort_order}",
        created_at=rel.created_at,
    )


class ProjectRelationOut(BaseModel):
    """One relation edge, project-wide. Deliberately leaner than StoryRelationOut: the
    graph already holds every story client-side, so re-sending titles/keys per edge
    would just be the story list again, once per edge."""

    story_id: str
    related_story_id: str
    relation_type: EStoryRelationType


# Not `/stories/relations/` -- that would collide with `/stories/{story_id}/`, which
# happily matches "relations" as an id.
@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/story-relations/",
    response_model=list[ProjectRelationOut],
)
async def list_project_relations(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Every relation edge in the project, in one query (GIN-159).

    The dependency graph needs all edges at once; per-story `/relations/` would be N+1
    across a 900-story project. Joined to Story so edges pointing at a soft-deleted
    item are dropped rather than rendering as arrows into nothing.
    """
    related = aliased(Story)
    rows = (
        await db.execute(
            select(StoryRelation)
            .join(Story, Story.id == StoryRelation.story_id)
            .join(related, related.id == StoryRelation.related_story_id)
            .where(
                Story.project_id == project.id,
                Story.deleted_at.is_(None),
                related.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    return [
        ProjectRelationOut(
            story_id=r.story_id,
            related_story_id=r.related_story_id,
            relation_type=r.relation_type,
        )
        for r in rows
    ]


def _blocking_edge(story_id: str, related_id: str, kind: EStoryRelationType) -> tuple[str, str] | None:
    """Normalize a relation to a (blocker, blocked) edge, or None if it isn't a
    blocking relation. BLOCKING means this story blocks the related one."""
    if kind == EStoryRelationType.BLOCKING:
        return story_id, related_id
    if kind == EStoryRelationType.BLOCKED_BY:
        return related_id, story_id
    return None


async def _reject_invalid_relation(
    db: AsyncSession, project: Project, story_id: str, payload: "CreateStoryRelationPayload"
) -> None:
    """Guard the relation graph (GIN-382): no self-relation, no duplicate of an
    identical relation, and no blocking cycle — A blocks B blocks A is not a
    dependency, it is a deadlock nothing can ever satisfy."""
    if story_id == payload.related_story_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A work item cannot relate to itself")
    duplicate = (
        await db.execute(
            select(StoryRelation.id).where(
                StoryRelation.story_id == story_id,
                StoryRelation.related_story_id == payload.related_story_id,
                StoryRelation.relation_type == payload.relation_type,
            )
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That relation already exists")

    edge = _blocking_edge(story_id, payload.related_story_id, payload.relation_type)
    if edge is None:
        return
    blocker, blocked = edge
    rows = (
        await db.execute(
            select(StoryRelation.story_id, StoryRelation.related_story_id, StoryRelation.relation_type)
            .join(Story, Story.id == StoryRelation.story_id)
            .where(Story.project_id == project.id)
        )
    ).all()
    graph: dict[str, list[str]] = {}
    for s_id, r_id, kind in rows:
        existing = _blocking_edge(s_id, r_id, kind)
        if existing:
            graph.setdefault(existing[0], []).append(existing[1])
    # The new edge closes a cycle when `blocked` already reaches `blocker`.
    seen, queue = {blocked}, [blocked]
    while queue:
        node = queue.pop()
        if node == blocker:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "That relation would create a circular blocking chain"
            )
        for nxt in graph.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)


@router.get(f"{_BASE}/relations/", response_model=list[StoryRelationOut])
async def list_relations(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    rows = (
        await db.execute(
            select(StoryRelation, Story)
            .join(Story, Story.id == StoryRelation.related_story_id)
            .where(StoryRelation.story_id == story_id)
            .order_by(StoryRelation.created_at)
        )
    ).all()
    return [_relation_out(rel, related, project.identifier) for rel, related in rows]


@router.post(
    f"{_BASE}/relations/", response_model=StoryRelationOut, status_code=status.HTTP_201_CREATED
)
async def create_relation(
    story_id: str,
    payload: CreateStoryRelationPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    related = await _get_story_or_404(db, project, payload.related_story_id)  # 404 if cross-project
    await _reject_invalid_relation(db, project, story_id, payload)
    rel = StoryRelation(
        story_id=story_id,
        related_story_id=payload.related_story_id,
        relation_type=payload.relation_type,
    )
    db.add(rel)
    related_key = f"{project.identifier}-{related.sort_order}"
    record_story_activity(
        db, story_id, ctx.user,
        kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.RELATION,
        summary=f"{payload.relation_type.value.replace('_', ' ')} {related_key}",
        new_value=related.title,
    )
    await db.commit()
    return _relation_out(rel, related, project.identifier)


@router.delete(f"{_BASE}/relations/{{relation_id}}/")
async def delete_relation(
    story_id: str,
    relation_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    rel = (
        await db.execute(
            select(StoryRelation).where(
                StoryRelation.id == relation_id, StoryRelation.story_id == story_id
            )
        )
    ).scalar_one_or_none()
    if rel is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relation not found")
    await db.delete(rel)
    await db.commit()
    return {"success": True}


# ─────────────────────────── Comments ───────────────────────────


class StoryCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    story_id: str
    body: str
    # What `body` holds, declared not sniffed (GIN-366): comment bodies are stored
    # and returned as rendered HTML, so a client never has to guess the format.
    content_format: str = "html"
    author_id: str | None
    author_name: str
    author_avatar_url: str | None
    created_at: datetime
    updated_at: datetime


class CreateStoryCommentPayload(BaseModel):
    body: str = Field(min_length=1)
    # Explicit, never sniffed (GIN-300 / ADR 0001). Absent means "html", which is
    # what the TipTap composer sends; agents and MCP pass "markdown".
    content_format: str | None = None


class UpdateStoryCommentPayload(BaseModel):
    body: str = Field(min_length=1)
    content_format: str | None = None


@router.get(f"{_BASE}/comments/", response_model=list[StoryCommentOut])
async def list_comments(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    rows = (
        await db.execute(
            select(StoryComment)
            .where(StoryComment.story_id == story_id)
            .order_by(StoryComment.created_at)
        )
    ).scalars().all()
    return list(rows)


@router.post(
    f"{_BASE}/comments/", response_model=StoryCommentOut, status_code=status.HTTP_201_CREATED
)
async def create_comment(
    story_id: str,
    payload: CreateStoryCommentPayload,
    background: BackgroundTasks,
    idempotency_key: str | None = None,
    # GIN-22 Part B decision: commenting is intentionally excluded from the
    # Viewer write-guard (Plane-style — a read-only member can still discuss),
    # unlike links/relations/comment edits below which change the story's data.
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    story = await _get_story_or_404(db, project, story_id)
    # Retry-safe comment (GIN-368): a repeat with the same idempotency_key replays
    # the first comment instead of posting a duplicate.
    fingerprint = request_fingerprint(
        "POST", f"create_comment:{story_id}", payload.model_dump(mode="json")
    )
    if idempotency_key:
        replayed = await replay_or_conflict(
            db, ctx.user.id, project.workspace_id, idempotency_key, fingerprint
        )
        if replayed is not None:
            return replayed
    # Canonical content dual-write (GIN-300).
    written = build_content(
        payload.body.strip(),
        content_format=parse_content_format(payload.content_format, default="html"),
        write_json=settings.content_json_write,
        source="agent" if payload.content_format == "markdown" else "editor",
    )
    comment = StoryComment(
        story_id=story_id,
        body=written.html,
        body_json=written.json,
        author_id=ctx.user.id,
        author_name=ctx.user.display_name,
        author_avatar_url=ctx.user.avatar_url,
    )
    db.add(comment)
    record_story_activity(
        db, story_id, ctx.user,
        kind=EStoryActivityKind.COMMENT, field=None,
        summary="left a comment", new_value=comment.body,
    )
    await notify_story_watchers(
        db,
        story,
        project,
        project.workspace_id,
        ctx.workspace.slug,
        trigger_key="story.comment",
        context={"actor": ctx.user.display_name, "story": story.title},
        kind=ENotificationKind.SYSTEM,
        actor_id=ctx.user.id,
        background=background,
        provider=email_provider,
    )
    await emit_story_mentions(
        db,
        project,
        story,
        ctx.workspace.slug,
        actor_id=ctx.user.id,
        actor_name=ctx.user.display_name,
        text=comment.body,
        background=background,
        provider=email_provider,
    )
    await db.commit()
    out = StoryCommentOut.model_validate(comment)
    if idempotency_key:
        return await store_idempotent(
            db, ctx.user.id, project.workspace_id, idempotency_key,
            fingerprint, out.model_dump(mode="json"),
        )
    return out


# ─────────────────────────── Time entries (GIN-55/56/57) ───────────────────────────


class TimeEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    story_id: str
    hours: float
    note: str
    user_id: str | None
    user_name: str
    user_avatar_url: str | None
    created_at: datetime


class CreateTimeEntryPayload(BaseModel):
    hours: float = Field(gt=0, le=1000)
    note: str = ""


@router.get(f"{_BASE}/time-entries/", response_model=list[TimeEntryOut])
async def list_time_entries(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    rows = (
        await db.execute(
            select(TimeEntry)
            .where(TimeEntry.story_id == story_id)
            .order_by(TimeEntry.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post(
    f"{_BASE}/time-entries/", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED
)
async def create_time_entry(
    story_id: str,
    payload: CreateTimeEntryPayload,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    entry = TimeEntry(
        story_id=story_id,
        hours=payload.hours,
        note=payload.note.strip(),
        user_id=ctx.user.id,
        user_name=ctx.user.display_name,
        user_avatar_url=ctx.user.avatar_url,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete(f"{_BASE}/time-entries/{{entry_id}}/")
async def delete_time_entry(
    story_id: str,
    entry_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    entry = (
        await db.execute(
            select(TimeEntry).where(
                TimeEntry.id == entry_id, TimeEntry.story_id == story_id
            )
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Time entry not found")
    # Only the logger may remove their own entry (Owner/Admin may remove any).
    if entry.user_id != ctx.user.id and ctx.role not in ADMINS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your time entry")
    await db.delete(entry)
    await db.commit()
    return {"success": True}


async def _comment_or_404(db: AsyncSession, story_id: str, comment_id: str) -> StoryComment:
    comment = (
        await db.execute(
            select(StoryComment).where(
                StoryComment.id == comment_id, StoryComment.story_id == story_id
            )
        )
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    return comment


@router.patch(f"{_BASE}/comments/{{comment_id}}/", response_model=StoryCommentOut)
async def update_comment(
    story_id: str,
    comment_id: str,
    payload: UpdateStoryCommentPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    comment = await _comment_or_404(db, story_id, comment_id)
    written = build_content(
        payload.body.strip(),
        content_format=parse_content_format(payload.content_format, default="html"),
        write_json=settings.content_json_write,
        source="agent" if payload.content_format == "markdown" else "editor",
    )
    comment.body = written.html
    comment.body_json = written.json
    await db.commit()
    return comment


@router.delete(f"{_BASE}/comments/{{comment_id}}/")
async def delete_comment(
    story_id: str,
    comment_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    comment = await _comment_or_404(db, story_id, comment_id)
    await db.delete(comment)
    await db.commit()
    return {"success": True}


# ─────────────────────────── History ───────────────────────────


class StoryActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    story_id: str
    kind: EStoryActivityKind
    field: EStoryActivityField | None
    actor_id: str | None
    actor_name: str
    summary: str
    old_value: str | None
    new_value: str | None
    created_at: datetime


@router.get(f"{_BASE}/history/", response_model=list[StoryActivityOut])
async def list_history(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    rows = (
        await db.execute(
            select(StoryActivity)
            .where(StoryActivity.story_id == story_id)
            .order_by(StoryActivity.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


# ─────────────────────────── Subscribe ───────────────────────────


class SubscriptionOut(BaseModel):
    subscribed: bool


async def _subscription(db: AsyncSession, story_id: str, user_id: str) -> StorySubscription | None:
    return (
        await db.execute(
            select(StorySubscription).where(
                StorySubscription.story_id == story_id,
                StorySubscription.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


@router.get(f"{_BASE}/subscribe/", response_model=SubscriptionOut)
async def get_subscription(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    sub = await _subscription(db, story_id, ctx.user.id)
    return SubscriptionOut(subscribed=sub is not None)


@router.post(f"{_BASE}/subscribe/", response_model=SubscriptionOut)
# Subscribing is a personal notification preference, not a project-data
# mutation — excluded from the Viewer write-guard like comment creation above.
async def subscribe(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    if await _subscription(db, story_id, ctx.user.id) is None:
        db.add(StorySubscription(story_id=story_id, user_id=ctx.user.id))
        await db.commit()
    return SubscriptionOut(subscribed=True)


@router.delete(f"{_BASE}/subscribe/", response_model=SubscriptionOut)
async def unsubscribe(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_story_or_404(db, project, story_id)
    sub = await _subscription(db, story_id, ctx.user.id)
    if sub is not None:
        await db.delete(sub)
        await db.commit()
    return SubscriptionOut(subscribed=False)
