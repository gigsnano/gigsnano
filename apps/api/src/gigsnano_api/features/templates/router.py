"""Templates & Recurring HTTP surface (GIN-239/240/241): template CRUD + AI draft,
apply a work-item template into a project, and manage recurrences (which are
schedule-trigger automation rules). Project templates apply via create_project's
`template_id`, not here."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.automations.scheduler import advance
from gigsnano_api.features.templates import service as S
from gigsnano_api.features.templates.drafter import draft_work_item_template
from gigsnano_api.features.templates.schemas import (
    DraftIn,
    RecurrenceIn,
    RecurrenceOut,
    TemplateIn,
    TemplateOut,
    TemplatePatch,
)
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, Project
from gigsnano_api.models.automations import AutomationRule
from gigsnano_api.models.templates import Template
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["templates"])
_W = "/workspaces/{workspace_slug}"
_P = "/workspaces/{workspace_slug}/projects/{project_id}"


def _t_out(t: Template) -> TemplateOut:
    return TemplateOut(
        id=t.id, workspace_id=t.workspace_id, kind=t.kind, name=t.name,
        visibility=t.visibility, content=t.content, version=t.version, created_at=t.created_at,
    )


def _rec_out(r: AutomationRule) -> RecurrenceOut:
    actions = (r.ast or {}).get("actions", [])
    template_id = actions[0]["params"].get("template_id") if actions else None
    sched = r.schedule or {}
    return RecurrenceOut(
        id=r.id, name=r.name, template_id=template_id,
        every=sched.get("every"), unit=sched.get("unit"),
        next_run_at=r.next_run_at, enabled=r.enabled, created_at=r.created_at,
    )


# ---- Templates -------------------------------------------------------------

@router.get(f"{_W}/templates/", response_model=list[TemplateOut])
async def list_templates(
    kind: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return [_t_out(t) for t in await S.list_templates(db, ctx.workspace.id, kind)]


@router.post(f"{_W}/templates/", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateIn,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        t = await S.create_template(
            db, workspace_id=ctx.workspace.id, actor_id=ctx.user.id,
            kind=payload.kind, name=payload.name, visibility=payload.visibility,
            content=payload.content,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    await db.commit()
    return _t_out(t)


@router.patch(f"{_W}/templates/{{template_id}}/", response_model=TemplateOut)
async def update_template(
    template_id: str, payload: TemplatePatch,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(Template, template_id)
    if t is None or t.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    if payload.name is not None:
        t.name = payload.name
    if payload.visibility is not None:
        t.visibility = payload.visibility
    if payload.content is not None:
        t.content = payload.content
        t.version += 1
    await db.commit()
    return _t_out(t)


@router.delete(f"{_W}/templates/{{template_id}}/")
async def delete_template(
    template_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    t = await db.get(Template, template_id)
    if t is None or t.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    await db.delete(t)
    await db.commit()
    return {"success": True}


@router.post(f"{_W}/templates/draft/")
async def draft_template(
    payload: DraftIn,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict:
    """Persona drafts a work-item template from a description (GIN-241) — not saved;
    the human reviews/edits, then POSTs it to /templates/."""
    draft, in_tok, out_tok, is_fake = await draft_work_item_template(llm, payload.text)
    await record_llm_usage(
        db, workspace_id=ctx.workspace.id, user_id=ctx.user.id,
        source=ELlmUsageSource.TEMPLATE, operation=ELlmUsageOperation.EXTRACT,
        model="fake" if is_fake else settings.anthropic_model,
        input_tokens=in_tok, output_tokens=out_tok, is_fake=is_fake,
    )
    await db.commit()
    return {
        "kind": "work_item", "name": draft.name,
        "content": {"fields": draft.fields.model_dump(), "checklist": draft.checklist},
    }


# ---- Apply a work-item template --------------------------------------------

@router.post(f"{_P}/templates/{{template_id}}/apply/", status_code=status.HTTP_201_CREATED)
async def apply_template(
    template_id: str,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    template = await S.get_template(db, template_id, ctx.workspace.id)
    if template is None or template.kind != "work_item":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work-item template not found")
    try:
        story = await S.apply_work_item_template(db, template, project, ctx.user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    await db.commit()
    return {"story_id": story.id}


# ---- Recurrences (schedule-trigger automation rules) -----------------------

@router.get(f"{_P}/recurrences/", response_model=list[RecurrenceOut])
async def list_recurrences(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(AutomationRule).where(
                AutomationRule.project_id == project.id,
                AutomationRule.trigger_event == "schedule",
            )
        )
    ).scalars().all()
    return [_rec_out(r) for r in rows]


@router.post(f"{_P}/recurrences/", response_model=RecurrenceOut, status_code=status.HTTP_201_CREATED)
async def create_recurrence(
    payload: RecurrenceIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    template = await S.get_template(db, payload.template_id, ctx.workspace.id)
    if template is None or template.kind != "work_item":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work-item template not found")
    schedule = {"every": payload.every, "unit": payload.unit}
    rule = AutomationRule(
        project_id=project.id, name=f"Recurring: {template.name}",
        source_text=f"every {payload.every} {payload.unit} from template {template.name}",
        trigger_event="schedule",
        ast={"trigger": "schedule", "conditions": [], "unsupported": [],
             "actions": [{"type": "create_from_template", "params": {"template_id": template.id}}]},
        schedule=schedule, next_run_at=advance(utcnow(), schedule), enabled=True,
    )
    db.add(rule)
    await db.commit()
    return _rec_out(rule)
