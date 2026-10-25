"""Sandboxed action runtime (GIN-254). A fixed {action_type: handler} table — no
arbitrary code — where each handler wraps an existing, audited primitive. Per-run
action cap, every action recorded, and a dry-run that records intent with zero
side effects. Story-mutating primitives are imported lazily inside handlers: the
dispatcher is tapped from stories.router, so a top-level import would cycle."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.automations.schemas import AutomationAst

MAX_ACTIONS = 10  # ponytail: per-run cap; make it a rate window if abuse shows up

# Fields set_field may touch (a status/priority value is coerced to its enum).
_SETTABLE = {"status", "priority", "assignee_id", "label_id", "label_ids", "ai_agent_id"}


async def _set_field(db, params, *, project, actor, story):
    if story is None:
        raise ValueError("set_field needs a target work item")
    field, value = params.get("field"), params.get("value")
    if field not in _SETTABLE:
        raise ValueError(f"field '{field}' is not settable by automation")
    from gigsnano_api.features.stories.service import _apply_story_update
    from gigsnano_api.models.stories import EStoryPriority, EStoryStatus

    coerce = {"status": EStoryStatus, "priority": EStoryPriority}.get(field)
    await _apply_story_update(db, story, actor, {field: coerce(value) if coerce else value})
    return f"set {field}={value}"


async def _assign_persona(db, params, *, project, actor, story):
    if story is None:
        raise ValueError("assign_persona needs a target work item")
    persona_id = params.get("persona_id")
    from gigsnano_api.features.agents.router import BMAD_AGENTS

    if persona_id not in {a["id"] for a in BMAD_AGENTS}:
        raise ValueError(f"unknown persona '{persona_id}'")
    from gigsnano_api.features.stories.service import _apply_story_update

    await _apply_story_update(db, story, actor, {"ai_agent_id": persona_id})
    return f"assigned {persona_id}"


async def _create_work_item(db, params, *, project, actor, story):
    title = (params.get("title") or "").strip()
    if not title:
        raise ValueError("create_work_item needs a title")
    from gigsnano_api.features.stories.service import _insert_story
    from gigsnano_api.models.stories import EStoryPriority, EStoryStatus, EStoryType

    fields = {"title": title[:300], "description": params.get("description") or "",
              "status": EStoryStatus.TODO}
    if params.get("type"):
        fields["type"] = EStoryType(params["type"])
    if params.get("priority"):
        fields["priority"] = EStoryPriority(params["priority"])
    new = await _insert_story(db, project, actor, fields)
    return f"created work item {new.id}"


async def _comment(db, params, *, project, actor, story):
    if story is None:
        raise ValueError("comment needs a target work item")
    body = (params.get("body") or "").strip()
    if not body:
        raise ValueError("comment needs a body")
    from gigsnano_api.features.stories.activity import record_story_activity
    from gigsnano_api.models.stories import EStoryActivityKind, StoryComment

    db.add(StoryComment(
        story_id=story.id, body=body, author_id=actor.id,
        author_name=actor.display_name, author_avatar_url=actor.avatar_url,
    ))
    record_story_activity(
        db, story.id, actor, kind=EStoryActivityKind.COMMENT, field=None,
        summary="left a comment", new_value=body,
    )
    return "commented"


async def _create_from_template(db, params, *, project, actor, story):
    """Recurring-work action (GIN-240): instantiate a work-item template into this
    rule's project. `story` is None on a scheduled fire — the template carries the fields."""
    from gigsnano_api.features.templates.service import apply_work_item_template
    from gigsnano_api.models.templates import Template

    template = await db.get(Template, params.get("template_id"))
    if template is None or template.kind != "work_item":
        raise ValueError("template not found or not a work_item template")
    if template.workspace_id != project.workspace_id and template.visibility != "public":
        raise ValueError("template not visible to this project")
    new = await apply_work_item_template(db, template, project, actor)
    return f"created work item {new.id} from template {template.name}"


_HANDLERS = {
    "set_field": _set_field,
    "assign_persona": _assign_persona,
    "create_work_item": _create_work_item,
    "comment": _comment,
    "create_from_template": _create_from_template,
}


async def execute_actions(
    db: AsyncSession, ast: AutomationAst, *, project, actor, story, dry_run: bool
) -> list[dict]:
    """Run the rule's actions through the allowlist. One entry recorded per action;
    a failing action never aborts the rest (each is caught and audited)."""
    taken: list[dict] = []
    for action in ast.actions[:MAX_ACTIONS]:
        entry: dict = {"type": action.type, "params": action.params}
        handler = _HANDLERS.get(action.type)
        if handler is None:  # belt-and-suspenders; the Literal already blocks this
            entry["error"] = "action not in allowlist"
        elif dry_run:
            entry["result"] = "(dry-run) would run"
        else:
            try:
                entry["result"] = await handler(
                    db, action.params, project=project, actor=actor, story=story
                )
            except Exception as exc:  # noqa: BLE001 - one bad action must not abort the run
                entry["error"] = f"{type(exc).__name__}: {exc}"
        taken.append(entry)
    if len(ast.actions) > MAX_ACTIONS:
        taken.append({"type": "_limit", "error": f"truncated to {MAX_ACTIONS} actions"})
    return taken
