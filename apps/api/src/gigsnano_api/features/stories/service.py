"""Story domain operations shared by the routes and by every other feature that
creates or edits work items (automations, intake, templates, importers, the agent
tools and the bulk endpoints).

These are the functions that own the *rules* — code resolution, FK/settings
validation, insertion with number allocation, field application with history — as
opposed to the HTTP shape, which lives in `router.py`."""

from datetime import date
from functools import lru_cache

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.content.fields import build_content, parse_content_format
from gigsnano_api.core.config import settings
from gigsnano_api.features.notifications.router import (
    story_notification_href,
)
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.features.stories.activity import record_story_activity
from gigsnano_api.features.stories.labels import (
    label_names,
    load_story_label_ids,
    normalize_label_ids,
    set_story_labels,
    validate_label_ids,
)
from gigsnano_api.features.stories.schemas import (
    StoryOut,
)
from gigsnano_api.models import (
    ECustomFieldType,
    EMemberStatus,
    EProjectActivityType,
    ESimpleSize,
    EStoryActivityField,
    EStoryActivityKind,
    Project,
    ProjectCustomField,
    ProjectEstimate,
    Story,
    StoryCustomFieldValue,
    WorkspaceMember,
)
from gigsnano_api.shared.serializers import (
    load_custom_values,
    serialize_story,
    sub_issue_counts,
)

_DIRECT_FIELDS = (
    "title", "description", "status", "priority", "type", "start_date", "target_date",
    "assignee_id", "ai_agent_id", "estimate_id", "estimate_points",
    "size", "duration_minutes", "parent_id",
    "cycle_id", "module_id",
    # Writable so imported work can carry its real date (GIN-527); the route
    # validates it isn't in the future before this runs.
    "created_at",
)
# Labels are NOT a direct column (GIN-475) — they live in `story_labels` and are
# written through `set_story_labels`, keyed off this field name in a payload.
LABELS_FIELD = "label_ids"

# Valid ESimpleSize values for the "simple" planning method (GIN-331).
_SIZE_VALUES = frozenset(s.value for s in ESimpleSize)

# Valid AI-agent assignee ids (the static BMAD roster), mirrors the frontend.
# Lazy + cached: `agents/router.py` now reaches back into this module via
# `agent/tools/bundles.py` -> `agent/tools/work_items.py`, so importing
# BMAD_AGENTS at module scope here would be circular (same reason
# `agents/service.py::seed_builtin_agents` imports it lazily).
@lru_cache(maxsize=1)
def _agent_ids() -> frozenset[str]:
    from gigsnano_api.features.agents.router import BMAD_AGENTS

    return frozenset(a["id"] for a in BMAD_AGENTS)

# UpdateStory field → story-history activity field (only user-facing fields are logged).
_ACTIVITY_FIELD_MAP = {
    "title": EStoryActivityField.TITLE,
    "description": EStoryActivityField.DESCRIPTION,
    "status": EStoryActivityField.STATUS,
    "priority": EStoryActivityField.PRIORITY,
    "start_date": EStoryActivityField.START_DATE,
    "target_date": EStoryActivityField.TARGET_DATE,
    "assignee_id": EStoryActivityField.ASSIGNEE,
    "parent_id": EStoryActivityField.PARENT,
    "cycle_id": EStoryActivityField.CYCLE,
    "module_id": EStoryActivityField.MODULE,
    # Reuses the existing CREATED value -- a backdate is precisely a change to
    # when the item was created, and it needs no enum migration. Rewriting
    # history silently is the actual risk here, so it is always logged.
    "created_at": EStoryActivityField.CREATED,
}


def _fmt_value(v: object) -> str | None:
    """Stringify an old/new field value for the activity feed."""
    if v is None:
        return None
    return v.value if hasattr(v, "value") else str(v)


async def _get_story_or_404(db: AsyncSession, project: Project, story_id: str) -> Story:
    story = await db.get(Story, story_id)
    if story is None or story.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    return story


def _story_notification_href(slug: str, project_id: str, story: Story) -> str:
    return story_notification_href(slug, project_id, story)


async def _validate_settings_refs(db: AsyncSession, project: Project, changes: dict) -> None:
    """A non-null label_ids/estimate_id must belong to this project (matches the mock).
    estimate_points, when set non-null, must be a positive integer."""
    if changes.get(LABELS_FIELD) is not None:
        changes[LABELS_FIELD] = await validate_label_ids(db, project, changes[LABELS_FIELD])
    estimate_id = changes.get("estimate_id")
    if estimate_id is not None:
        est = await db.get(ProjectEstimate, estimate_id)
        if est is None or est.project_id != project.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estimate must belong to this project")
    points = changes.get("estimate_points")
    if points is not None and (not isinstance(points, int) or points <= 0):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estimate points must be a positive number")
    # Per-method estimate inputs (GIN-331): a size must be a known ESimpleSize; a
    # duration must be a positive whole number of minutes. Null clears the field
    # (stays explicitly unestimated). "Invalid values fail visibly."
    size = changes.get("size")
    if size is not None and size not in _SIZE_VALUES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Size must be one of XS, S, M, L, XL")
    duration = changes.get("duration_minutes")
    if duration is not None and (
        not isinstance(duration, int) or isinstance(duration, bool) or duration <= 0
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Duration must be a positive number of minutes"
        )
    # Assignment is workspace-scoped (not project-scoped): a non-null assignee must
    # be an active member of the project's workspace. This rejects a bogus/foreign
    # user id while preserving the established behaviour of assigning to any
    # workspace member (e.g. a member not yet added to this specific project).
    assignee_id = changes.get("assignee_id")
    if assignee_id is not None:
        member = (
            await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == project.workspace_id,
                    WorkspaceMember.user_id == assignee_id,
                    WorkspaceMember.status == EMemberStatus.ACTIVE,
                )
            )
        ).scalar_one_or_none()
        if member is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Assignee must be an active workspace member"
            )


async def _project_bmad_stories(db: AsyncSession, project_id: str) -> list[Story]:
    result = await db.execute(
        select(Story)
        .where(Story.project_id == project_id, Story.bmad_workflow.is_not(None))
        .order_by(Story.sort_order)
    )
    return list(result.scalars().all())


async def _serialize_one(
    db: AsyncSession,
    story: Story,
    workspace_slug: str,
    identifier: str,
    want_format: str = "html",
) -> StoryOut:
    counts = await sub_issue_counts(db, [story.id])
    custom_values = await load_custom_values(db, [story.id])
    labels = await load_story_label_ids(db, [story.id])
    return serialize_story(
        story, workspace_slug, counts, identifier,
        custom_values=custom_values, want_format=want_format, label_ids=labels,
    )


def _parse_code(code: str) -> tuple[str, int]:
    identifier, _, num = code.rpartition("-")
    if not identifier or not num.isdigit():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bad work-item code: {code}")
    return identifier, int(num)


async def _resolve_workspace_code(
    db: AsyncSession, workspace_id: str, code: str
) -> tuple[Project, Story]:
    """Resolve a code like 'MBA-1' to its (project, story) within a workspace.

    The code's identifier prefix selects the project; the trailing number
    selects the story within it.
    """
    identifier, number = _parse_code(code)
    project = (
        await db.execute(
            select(Project).where(
                Project.workspace_id == workspace_id, Project.identifier == identifier
            )
        )
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No project '{identifier}' in workspace")
    story = (
        await db.execute(
            select(Story).where(Story.project_id == project.id, Story.story_number == number)
        )
    ).scalar_one_or_none()
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No work item '{code}'")
    return project, story



async def _insert_story(
    db: AsyncSession, project: Project, actor: User, fields: dict
) -> Story:
    """Core Story insert: sort_order + retried story_number allocation + the CREATED
    activity row. Caller owns FK/settings-ref validation, notifications, webhook
    dispatch, and the commit — this is the DB-mutation core shared by the HTTP
    `create_story` route and the `create_work_item` agent tool (GIN-33)."""
    max_order = (
        await db.execute(
            select(func.coalesce(func.max(Story.sort_order), -1)).where(
                Story.project_id == project.id
            )
        )
    ).scalar_one()
    # Canonical content dual-write (GIN-300), same seam as _apply_story_update.
    fields = dict(fields)
    # Labels are association rows, not a column — held back until the story has an id.
    # The deprecated singular is dropped here too: `LegacyLabelMixin` has already
    # folded it into `label_ids`, and Story has no such attribute to set (GIN-475).
    label_ids = normalize_label_ids(fields.pop(LABELS_FIELD, None))
    fields.pop("label_id", None)
    content_format = fields.pop("content_format", None)
    written = build_content(
        fields.get("description"),
        content_format=parse_content_format(content_format, default="html"),
        write_json=settings.content_json_write,
        source="agent" if content_format == "markdown" else "editor",
    )
    if fields.get("description") is not None:
        fields["description"] = written.html
    story = Story(
        project_id=project.id,
        sort_order=max_order + 1,
        description_json=written.json,
        **fields,
    )
    for _attempt in range(5):
        next_number = (
            await db.execute(
                select(func.coalesce(func.max(Story.story_number), 0) + 1)
                .where(Story.project_id == project.id)
                # Trashed rows still hold their number under the (project_id,
                # story_number) unique constraint, so the sequence must see past
                # the soft-delete filter or every create after trashing the top
                # item collides forever (GIN-97 fallout).
                .execution_options(include_deleted=True)
            )
        ).scalar_one()
        story.story_number = next_number
        try:
            async with db.begin_nested():  # savepoint — only this insert rolls back on conflict
                db.add(story)
                await db.flush()  # populate story.id for the activity row
            break
        except IntegrityError:
            continue
    else:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Could not allocate a story number"
        )
    if label_ids:
        await set_story_labels(db, story.id, label_ids)
    record_activity(
        db, project.id, EProjectActivityType.STORY, actor, f"created story {story.title}"
    )
    record_story_activity(
        db, story.id, actor,
        kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.CREATED,
        summary="created the work item",
    )
    return story


async def _apply_story_update(
    db: AsyncSession, story: Story, actor: User, changes: dict
) -> list[str]:
    """Core field-setting + per-field activity logging shared by the HTTP `update_story`
    PATCH route and the `update_work_item` agent tool. Caller owns FK/settings-ref
    validation, BMAD lock enforcement, readiness/notification side effects, and the
    commit. Returns the names of fields that actually changed (GIN-33)."""
    activity_old = {f: getattr(story, f) for f in _ACTIVITY_FIELD_MAP if f in changes}

    # Canonical content dual-write (GIN-300). Hooked here rather than at each
    # caller because this helper is the one choke point both the PATCH route and
    # the agent `update_work_item` tool route through.
    #
    # `changes["description"]` is rewritten to the derived HTML so the normal
    # field loop below stores that rather than the caller's raw Markdown/JSON —
    # and so the description activity row diffs rendered against rendered.
    changes = dict(changes)
    content_format = changes.pop("content_format", None)
    if "description" in changes:
        written = build_content(
            changes["description"],
            content_format=parse_content_format(content_format, default="html"),
            write_json=settings.content_json_write,
            source="agent" if content_format == "markdown" else "editor",
        )
        changes["description"] = written.html
        story.description_json = written.json

    for field in _DIRECT_FIELDS:
        if field in changes:
            setattr(story, field, changes[field])
    # `order` (JSON) maps to the sort_order column (renamed to dodge the SQL keyword).
    if "order" in changes:
        story.sort_order = changes["order"]

    changed: list[str] = []

    # Labels: set-replacement into `story_labels`, with its own history row since
    # it isn't a column the loop below can diff (GIN-475). Absent key = untouched,
    # so a PATCH of some other field can never silently drop a story's labels.
    if changes.get(LABELS_FIELD) is not None:
        moved = await set_story_labels(db, story.id, normalize_label_ids(changes[LABELS_FIELD]))
        if moved is not None:
            old_ids, new_ids = moved
            changed.append(LABELS_FIELD)
            record_story_activity(
                db, story.id, actor,
                kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.LABEL,
                summary="changed labels",
                old_value=await label_names(db, old_ids) or None,
                new_value=await label_names(db, new_ids) or None,
            )

    for f, old in activity_old.items():
        new = getattr(story, f)
        if old == new:
            continue
        changed.append(f)
        field_enum = _ACTIVITY_FIELD_MAP[f]
        record_story_activity(
            db, story.id, actor,
            kind=EStoryActivityKind.TRANSITION if f == "status" else EStoryActivityKind.PROPERTY,
            field=field_enum,
            summary=f"changed {field_enum.value.replace('_', ' ')}",
            old_value=_fmt_value(old), new_value=_fmt_value(new),
        )
    return changed


def _coerce_custom_value(field: ProjectCustomField, raw: object) -> str | None:
    """Coerce a raw custom-field value from `UpdateStoryPayload.custom_fields` into
    the string stored in `StoryCustomFieldValue.value` (or None to clear it).
    Raises HTTPException(400) on a value that doesn't fit the field's type."""
    if raw is None or raw == "":
        return None
    if field.field_type == ECustomFieldType.NUMBER:
        try:
            as_float = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError) as err:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Invalid number for '{field.name}'"
            ) from err
        return str(int(as_float)) if as_float.is_integer() else str(as_float)
    if field.field_type == ECustomFieldType.DATE:
        try:
            date.fromisoformat(str(raw))
        except ValueError as err:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Invalid date for '{field.name}'"
            ) from err
        return str(raw)
    if field.field_type == ECustomFieldType.SELECT:
        value = str(raw)
        if value not in (field.options or []):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"'{value}' is not a valid option for '{field.name}'",
            )
        return value
    return str(raw)


async def apply_custom_field_values(
    db: AsyncSession, project: Project, story: Story, values: dict[str, object]
) -> None:
    """Upsert/clear custom-field values on `story` from the `{field_id: raw}` map in
    `UpdateStoryPayload.custom_fields`. Loads this project's fields once, then per
    key: rejects an unknown/foreign field id, coerces the raw value against the
    field's type (400 on mismatch), and inserts/updates/deletes the
    `StoryCustomFieldValue` row accordingly. Caller commits alongside the rest of
    the story update (no commit here)."""
    fields = {
        f.id: f
        for f in (
            await db.execute(
                select(ProjectCustomField).where(ProjectCustomField.project_id == project.id)
            )
        ).scalars()
    }
    for field_id, raw in values.items():
        field = fields.get(field_id)
        if field is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown custom field: {field_id}")
        text = _coerce_custom_value(field, raw)
        existing = (
            await db.execute(
                select(StoryCustomFieldValue).where(
                    StoryCustomFieldValue.story_id == story.id,
                    StoryCustomFieldValue.field_id == field_id,
                )
            )
        ).scalar_one_or_none()
        if text is None:
            if existing is not None:
                await db.delete(existing)
        elif existing is None:
            db.add(StoryCustomFieldValue(story_id=story.id, field_id=field_id, value=text))
        else:
            existing.value = text



async def _collect_subtree_ids(
    db: AsyncSession, project_id: str, root_id: str, *, include_deleted: bool
) -> list[str]:
    """Breadth-first collect root + all descendant story ids via parent_id.

    `include_deleted=False` walks live children (cascade delete); `True` walks the
    already-trashed subtree (cascade restore/purge)."""
    ids = [root_id]
    frontier = [root_id]
    while frontier:
        rows = await db.execute(
            select(Story.id)
            .where(Story.parent_id.in_(frontier), Story.project_id == project_id)
            .execution_options(include_deleted=include_deleted)
        )
        children = [r[0] for r in rows.all() if r[0] not in ids]  # cycle guard
        ids.extend(children)
        frontier = children
    return ids



def _story_code(identifier: str, story: Story) -> str | None:
    """The human-facing code (MBA-12), or None for a row without a number yet."""
    return f"{identifier}-{story.story_number}" if story.story_number is not None else None


async def _get_trashed_story_or_404(db: AsyncSession, project: Project, story_id: str) -> Story:
    story = await db.get(Story, story_id, execution_options={"include_deleted": True})
    if story is None or story.project_id != project.id or story.deleted_at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trashed work item not found")
    return story


