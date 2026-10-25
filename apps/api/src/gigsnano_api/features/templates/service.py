"""Template persistence + apply (GIN-239). Templates are workspace artifacts
(private or public); applying one instantiates the target by reusing the existing
seams — `_insert_story` for work items, `lock_foundation` for a project's
Foundation. Story-mutating imports are lazy (the executor taps this from a path
that would otherwise cycle through stories.router)."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.stories import EStoryPriority, EStoryStatus, EStoryType
from gigsnano_api.models.templates import Template

_KINDS = ("project", "work_item")
_VISIBILITY = ("private", "public")
# Story columns a work-item template may preset (enum fields are coerced).
_TEMPLATE_FIELDS = {
    "title", "description", "type", "priority", "status",
    "assignee_id", "label_id", "label_ids", "estimate_id", "ai_agent_id",
}
_ENUM_COERCE = {"type": EStoryType, "priority": EStoryPriority, "status": EStoryStatus}


async def list_templates(db: AsyncSession, workspace_id: str, kind: str | None = None) -> list[Template]:
    stmt = select(Template).where(
        or_(Template.workspace_id == workspace_id, Template.visibility == "public")
    )
    if kind:
        stmt = stmt.where(Template.kind == kind)
    return list((await db.execute(stmt.order_by(Template.name))).scalars().all())


async def get_template(db: AsyncSession, template_id: str, workspace_id: str) -> Template | None:
    t = await db.get(Template, template_id)
    if t is None or (t.workspace_id != workspace_id and t.visibility != "public"):
        return None
    return t


async def create_template(
    db: AsyncSession, *, workspace_id: str, actor_id: str,
    kind: str, name: str, visibility: str, content: dict,
) -> Template:
    if kind not in _KINDS:
        raise ValueError(f"unknown template kind '{kind}'")
    if visibility not in _VISIBILITY:
        raise ValueError(f"unknown visibility '{visibility}'")
    t = Template(
        workspace_id=workspace_id, created_by_id=actor_id,
        kind=kind, name=name, visibility=visibility, content=content or {},
    )
    db.add(t)
    await db.flush()
    return t


def story_fields_from_template(content: dict) -> dict:
    """Coerce a work-item template's stored `fields` into a `_insert_story` dict."""
    raw = (content or {}).get("fields", {})
    fields: dict = {}
    for key, value in raw.items():
        if key not in _TEMPLATE_FIELDS or value is None:
            continue
        coerce = _ENUM_COERCE.get(key)
        fields[key] = coerce(value) if coerce else value
    return fields


async def apply_work_item_template(db: AsyncSession, template: Template, project, actor):
    """Create a Story (+ optional checklist children) from a work-item template."""
    from gigsnano_api.features.stories.service import _insert_story

    fields = story_fields_from_template(template.content)
    if not fields.get("title"):
        raise ValueError("work-item template has no title")
    story = await _insert_story(db, project, actor, fields)
    for item in (template.content or {}).get("checklist", [])[:20]:
        await _insert_story(
            db, project, actor,
            {"title": str(item)[:300], "parent_id": story.id, "status": EStoryStatus.TODO},
        )
    return story


async def apply_project_template(db: AsyncSession, content: dict, project) -> None:
    """Seed a new project's Foundation from a project template (states/features are
    already seeded by create_project's defaults)."""
    foundation = (content or {}).get("foundation")
    if foundation:
        from gigsnano_api.features.foundation.service import lock_foundation

        await lock_foundation(db, project_id=project.id, **foundation)
