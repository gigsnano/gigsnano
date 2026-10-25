"""Work-item (Story) agentic tools: query (read-only), create, update.

Access is enforced via `accessible_project_ids` — the same helper the HTTP routes use
(`shared/context.py`). It's typed for `WorkspaceContext`, but only reads `.role`,
`.workspace.id`, `.user.id` — `ToolContext` has the same attribute names, so it's passed
straight through (structural typing, no adapter needed).

create_work_item / update_work_item reuse the exact DB-mutation core the HTTP
stories routes use (`_insert_story` / `_apply_story_update` in
`features/stories/router.py`) — see that module for the field-default/activity-row
behavior this preserves. This module only adds tool-shaped argument parsing +
access scoping around those two helpers; it never re-implements the mutation.
"""

from fastapi import HTTPException
from sqlalchemy import select

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.auth.models import User
from gigsnano_api.bmad.markdown_html import markdown_or_html_to_html
from gigsnano_api.features.stories.activity import record_story_activity
from gigsnano_api.features.stories.service import (
    _apply_story_update,
    _insert_story,
    _resolve_workspace_code,
)
from gigsnano_api.models import (
    EMemberStatus,
    EStoryActivityKind,
    EStoryPriority,
    EStoryStatus,
    EStoryType,
    Project,
    Story,
    StoryComment,
    WorkspaceMember,
)
from gigsnano_api.shared.context import accessible_project_ids, reject_if_project_viewer

_STATUS_VALUES = {s.value for s in EStoryStatus}
_PRIORITY_VALUES = {p.value for p in EStoryPriority}
_TYPE_VALUES = {t.value for t in EStoryType}

QUERY_WORK_ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "array", "items": {"type": "string"}},
        "assignee": {"type": "string"},
        "project": {"type": "string"},
        "priority": {"type": "array", "items": {"type": "string"}},
        "type": {"type": "array", "items": {"type": "string"}},
        "text": {"type": "string"},
        "limit": {"type": "integer"},
    },
    "required": [],
    "additionalProperties": False,
}


async def _resolve_assignee(
    ctx: ToolContext, workspace_id: str, assignee: str
) -> tuple[bool, str | None]:
    """Resolve an `assignee` tool arg to a story `assignee_id`. Accepts 'me',
    'unassigned', or a user id that is an active member of `workspace_id`
    (mirrors the workspace-member check `_validate_settings_refs` applies to
    `update_story`'s `assignee_id`). Returns (ok, resolved_id)."""
    if assignee == "me":
        return True, ctx.user.id
    if assignee == "unassigned":
        return True, None
    member = (
        await ctx.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == assignee,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    return (True, assignee) if member is not None else (False, None)


def _format_row(story: Story, identifier: str, project_name: str, assignee_name: str | None) -> str:
    code = f"{identifier}-{story.story_number}"
    who = assignee_name or "unassigned"
    return f"{code}  {story.title}  [{story.status.value}/{story.priority.value}]  {project_name}  {who}"


async def query_work_items(ctx: ToolContext, args: dict) -> ToolResult:
    db = ctx.db
    pids = await accessible_project_ids(db, ctx)  # None = admin/owner sees every project

    stmt = (
        select(Story, Project.identifier, Project.name, User.display_name)
        .join(Project, Project.id == Story.project_id)
        .outerjoin(User, User.id == Story.assignee_id)
        .where(Project.workspace_id == ctx.workspace.id)
    )
    if pids is not None:
        stmt = stmt.where(Story.project_id.in_(pids))

    statuses = {s for s in (args.get("status") or []) if s in _STATUS_VALUES}
    if statuses:
        stmt = stmt.where(Story.status.in_(statuses))
    priorities = {p for p in (args.get("priority") or []) if p in _PRIORITY_VALUES}
    if priorities:
        stmt = stmt.where(Story.priority.in_(priorities))
    types = {t for t in (args.get("type") or []) if t in _TYPE_VALUES}
    if types:
        stmt = stmt.where(Story.type.in_(types))

    project = args.get("project")
    if project:
        stmt = stmt.where((Project.id == project) | (Project.name.ilike(project)))

    assignee = args.get("assignee")
    if assignee == "me":
        stmt = stmt.where(Story.assignee_id == ctx.user.id)
    elif assignee == "unassigned":
        stmt = stmt.where(Story.assignee_id.is_(None))
    elif assignee:
        stmt = stmt.where(Story.assignee_id == assignee)

    text = args.get("text")
    if text:
        stmt = stmt.where(Story.title.ilike(f"%{text}%"))

    # ponytail: fetches every match then slices in Python instead of SQL OFFSET/LIMIT —
    # this is a chat tool scoped to one workspace, not a paginated list endpoint. Move
    # the limit into the query if workspaces grow into the tens of thousands of stories.
    rows = (await db.execute(stmt)).all()
    total = len(rows)
    limit = max(1, min(50, args.get("limit") or 20))

    lines = [f"Total matching: {total}"]
    lines.extend(_format_row(story, identifier, project_name, assignee_name) for story, identifier, project_name, assignee_name in rows[:limit])

    return ToolResult(content="\n".join(lines), summary=f"Found {total}")


QUERY_WORK_ITEMS = Tool(
    name="query_work_items",
    description=(
        "Search work items (stories) in the current workspace, scoped to the projects the "
        "caller can access. All filters are optional: status (list), assignee "
        "('me' | user id | 'unassigned'), project (id or name), priority (list), "
        "type (list), text (title substring), limit (1-50, default 20)."
    ),
    input_schema=QUERY_WORK_ITEMS_SCHEMA,
    handler=query_work_items,
    mutating=False,
)


async def _resolve_accessible_project(ctx: ToolContext, project_ref: str) -> Project | None:
    """Resolve `project_ref` (id or name) to a Project in the caller's workspace,
    scoped to `accessible_project_ids` — the same access rule `query_work_items` uses."""
    pids = await accessible_project_ids(ctx.db, ctx)
    stmt = select(Project).where(
        Project.workspace_id == ctx.workspace.id,
        (Project.id == project_ref) | (Project.name.ilike(project_ref)),
    )
    if pids is not None:
        stmt = stmt.where(Project.id.in_(pids))
    return (await ctx.db.execute(stmt)).scalars().first()


CREATE_WORK_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "project": {"type": "string"},
        "title": {"type": "string"},
        "type": {"type": "string"},
        "description": {"type": "string"},
        "priority": {"type": "string"},
        "parent": {"type": "string"},
    },
    "required": ["project", "title"],
    "additionalProperties": False,
}


async def create_work_item(ctx: ToolContext, args: dict) -> ToolResult:
    project_ref = args.get("project")
    title = args.get("title")
    if not project_ref or not title:
        return ToolResult("project and title are required", is_error=True)

    project = await _resolve_accessible_project(ctx, project_ref)
    if project is None:
        return ToolResult(f"No accessible project matching '{project_ref}'", is_error=True)

    try:
        await reject_if_project_viewer(ctx.db, ctx, project.id)
    except HTTPException as exc:
        return ToolResult(str(exc.detail), is_error=True)

    fields: dict = {"title": title}
    story_type = args.get("type")
    if story_type in _TYPE_VALUES:
        fields["type"] = EStoryType(story_type)
    description = args.get("description")
    if description:
        # Model usually emits Markdown; story.description is rendered as HTML by the
        # TipTap editor. Convert Markdown so it isn't shown as literal text (GIN-29),
        # but pass through input that's already HTML rather than escaping it (GIN-117).
        fields["description"] = markdown_or_html_to_html(description)
    priority = args.get("priority")
    if priority in _PRIORITY_VALUES:
        fields["priority"] = EStoryPriority(priority)

    # Nest under a parent (e.g. an epic's stories): resolve the parent code to a
    # story that must live in the SAME project as the new item, then link it. This
    # is what makes "an epic and its stories" a real hierarchy instead of flat
    # items that only name the epic in prose.
    parent_ref = args.get("parent")
    if parent_ref:
        try:
            parent_project, parent_story = await _resolve_workspace_code(
                ctx.db, ctx.workspace.id, parent_ref
            )
        except HTTPException as exc:
            return ToolResult(str(exc.detail), is_error=True)
        if parent_project.id != project.id:
            return ToolResult(
                f"Parent '{parent_ref}' is in a different project than '{project.name}'",
                is_error=True,
            )
        fields["parent_id"] = parent_story.id

    try:
        story = await _insert_story(ctx.db, project, ctx.user, fields)
    except HTTPException as exc:
        return ToolResult(str(exc.detail), is_error=True)

    await ctx.db.commit()
    code = f"{project.identifier}-{story.story_number}"
    return ToolResult(
        f"Created {code}: {story.title}",
        summary=f"Created {code}",
        link=f"/{ctx.workspace.slug}/projects/{project.id}/issues/{story.id}",
    )


CREATE_WORK_ITEM = Tool(
    name="create_work_item",
    description=(
        "Create a new work item (story) in a project the caller can access. "
        "Args: project (id or name, required), title (required), type "
        "(epic|feature|story|task|bug), description (Markdown — headings, lists, "
        "**bold**, *italic*, `code`), priority "
        "(urgent|high|medium|low|none), parent (optional work-item code like "
        "'GIN-45' to nest this item under — must be in the same project). New "
        "items start as status Todo. To create an epic with its stories, FIRST "
        "create the epic (type 'epic') so you get its code, THEN create each story "
        "with parent set to that epic code so they nest under it."
    ),
    input_schema=CREATE_WORK_ITEM_SCHEMA,
    handler=create_work_item,
    mutating=True,
)


UPDATE_WORK_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "code": {"type": "string"},
        "status": {"type": "string"},
        "priority": {"type": "string"},
        "assignee": {"type": "string"},
        "title": {"type": "string"},
        "type": {"type": "string"},
    },
    "required": ["code"],
    "additionalProperties": False,
}


async def update_work_item(ctx: ToolContext, args: dict) -> ToolResult:
    code = args.get("code")
    if not code:
        return ToolResult("code is required", is_error=True)

    try:
        project, story = await _resolve_workspace_code(ctx.db, ctx.workspace.id, code)
    except HTTPException as exc:
        return ToolResult(str(exc.detail), is_error=True)

    pids = await accessible_project_ids(ctx.db, ctx)
    if pids is not None and project.id not in pids:
        return ToolResult(f"No accessible work item '{code}'", is_error=True)

    try:
        await reject_if_project_viewer(ctx.db, ctx, project.id)
    except HTTPException as exc:
        return ToolResult(str(exc.detail), is_error=True)

    changes: dict = {}
    status_val = args.get("status")
    if status_val in _STATUS_VALUES:
        changes["status"] = EStoryStatus(status_val)
    priority_val = args.get("priority")
    if priority_val in _PRIORITY_VALUES:
        changes["priority"] = EStoryPriority(priority_val)
    type_val = args.get("type")
    if type_val in _TYPE_VALUES:
        changes["type"] = EStoryType(type_val)
    title_val = args.get("title")
    if title_val:
        changes["title"] = title_val
    assignee = args.get("assignee")
    if assignee:
        ok, resolved = await _resolve_assignee(ctx, ctx.workspace.id, assignee)
        if not ok:
            return ToolResult("That assignee isn't a member of this project.", is_error=True)
        changes["assignee_id"] = resolved

    if not changes:
        return ToolResult("No recognized fields to update", is_error=True)

    # Server-side BMAD unlock enforcement (mirrors `update_story`): a locked
    # Sprint-0 card's status cannot be progressed via the tool either.
    if story.bmad_workflow is not None and story.bmad_is_locked and "status" in changes:
        return ToolResult(
            "This BMAD card is locked; complete its prerequisites first.", is_error=True
        )

    changed_fields = await _apply_story_update(ctx.db, story, ctx.user, changes)
    await ctx.db.commit()

    out_code = f"{project.identifier}-{story.story_number}"
    if not changed_fields:
        return ToolResult(f"{out_code}: no changes applied", summary=f"{out_code}: no change")
    return ToolResult(
        f"Updated {out_code}: {', '.join(changed_fields)}", summary=f"Updated {out_code}"
    )


UPDATE_WORK_ITEM = Tool(
    name="update_work_item",
    description=(
        "Update a work item (story) by its code (e.g. 'ALP-3'), scoped to projects the "
        "caller can access. Args: code (required), status (todo|in_progress|in_review|done), "
        "priority (urgent|high|medium|low|none), assignee ('me' | user id | 'unassigned'), "
        "title, type (epic|feature|story|task|bug). Only provided args are changed."
    ),
    input_schema=UPDATE_WORK_ITEM_SCHEMA,
    handler=update_work_item,
    mutating=True,
)


ADD_COMMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "code": {"type": "string"},
        "body": {"type": "string"},
    },
    "required": ["code", "body"],
    "additionalProperties": False,
}


async def add_comment(ctx: ToolContext, args: dict) -> ToolResult:
    code = args.get("code")
    body = args.get("body")
    if not code or not body:
        return ToolResult("code and body are required", is_error=True)

    try:
        project, story = await _resolve_workspace_code(ctx.db, ctx.workspace.id, code)
    except HTTPException as exc:
        return ToolResult(str(exc.detail), is_error=True)

    pids = await accessible_project_ids(ctx.db, ctx)
    if pids is not None and project.id not in pids:
        return ToolResult(f"No accessible work item '{code}'", is_error=True)

    # No reject_if_project_viewer here: commenting is intentionally excluded from
    # the Viewer write-guard (GIN-22 Part B), same as the HTTP create_comment route
    # — a read-only member can still discuss.
    comment = StoryComment(
        story_id=story.id,
        body=markdown_or_html_to_html(body),
        author_id=ctx.user.id,
        author_name=ctx.user.display_name,
        author_avatar_url=ctx.user.avatar_url,
    )
    ctx.db.add(comment)
    record_story_activity(
        ctx.db, story.id, ctx.user,
        kind=EStoryActivityKind.COMMENT, field=None,
        summary="left a comment", new_value=comment.body,
    )
    await ctx.db.commit()

    out_code = f"{project.identifier}-{story.story_number}"
    return ToolResult(
        f"Commented on {out_code}", summary=f"Commented on {out_code}",
        link=f"/{ctx.workspace.slug}/projects/{project.id}/issues/{story.id}",
    )


ADD_COMMENT = Tool(
    name="add_comment",
    description=(
        "Add a comment to a work item (story) by its code (e.g. 'ALP-3'), scoped to "
        "projects the caller can access. Args: code (required), body (required, Markdown)."
    ),
    input_schema=ADD_COMMENT_SCHEMA,
    handler=add_comment,
    mutating=True,
)


def build_work_item_registry() -> ToolRegistry:
    return ToolRegistry([QUERY_WORK_ITEMS, CREATE_WORK_ITEM, UPDATE_WORK_ITEM, ADD_COMMENT])
