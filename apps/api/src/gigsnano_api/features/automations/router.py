"""Automation HTTP surface (GIN-252/254): compile-preview, CRUD, dry-run, and the
run-history audit. Triggering + execution happen in the dispatcher tapped from the
story routes; this is authoring + inspection."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing.entitlements import require_entitlement
from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.features.automations.compiler import compile_automation
from gigsnano_api.features.automations.executor import execute_actions
from gigsnano_api.features.automations.schemas import (
    AutomationAst,
    AutomationIn,
    AutomationOut,
    AutomationPatch,
    AutomationRunOut,
    CompileIn,
    DryRunIn,
)
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, Project
from gigsnano_api.models.automations import AutomationRule, AutomationRun
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["automations"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"


def _rule_out(r: AutomationRule) -> AutomationOut:
    return AutomationOut(
        id=r.id, project_id=r.project_id, name=r.name, source_text=r.source_text,
        trigger_event=r.trigger_event, ast=r.ast, enabled=r.enabled, created_at=r.created_at,
    )


def _run_out(r: AutomationRun) -> AutomationRunOut:
    return AutomationRunOut(
        id=r.id, automation_id=r.automation_id, trigger_event=r.trigger_event,
        story_id=r.story_id, dry_run=r.dry_run, status=r.status,
        actions_taken=r.actions_taken, created_at=r.created_at,
    )


async def _bill_compile(db, ctx, project_id, in_tok, out_tok, is_fake) -> None:
    await record_llm_usage(
        db, workspace_id=ctx.workspace.id, user_id=ctx.user.id,
        source=ELlmUsageSource.AUTOMATION, operation=ELlmUsageOperation.EXTRACT,
        model="fake" if is_fake else settings.anthropic_model,
        input_tokens=in_tok, output_tokens=out_tok, project_id=project_id, is_fake=is_fake,
    )


async def _rule_or_404(db, rule_id, project_id) -> AutomationRule:
    rule = await db.get(AutomationRule, rule_id)
    if rule is None or rule.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Automation not found")
    return rule


@router.post(f"{_P}/automation-rules/preview/")
async def preview(
    payload: CompileIn,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict:
    """Compile NL → AST for review without saving (GIN-252)."""
    ast, in_tok, out_tok, is_fake = await compile_automation(llm, payload.text)
    await _bill_compile(db, ctx, project.id, in_tok, out_tok, is_fake)
    await db.commit()
    return ast.model_dump()


@router.get(f"{_P}/automation-rules/", response_model=list[AutomationOut])
async def list_automations(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(select(AutomationRule).where(AutomationRule.project_id == project.id))
    ).scalars().all()
    return [_rule_out(r) for r in rows]


@router.post(f"{_P}/automation-rules/", response_model=AutomationOut, status_code=status.HTTP_201_CREATED)
async def create_automation(
    payload: AutomationIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _ent: WorkspaceContext = Depends(require_entitlement("automations")),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    ast, in_tok, out_tok, is_fake = await compile_automation(llm, payload.text)
    rule = AutomationRule(
        project_id=project.id, name=payload.name, source_text=payload.text,
        trigger_event=ast.trigger, ast=ast.model_dump(), enabled=payload.enabled,
    )
    db.add(rule)
    await _bill_compile(db, ctx, project.id, in_tok, out_tok, is_fake)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)


@router.patch(f"{_P}/automation-rules/{{rule_id}}/", response_model=AutomationOut)
async def update_automation(
    rule_id: str,
    payload: AutomationPatch,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    rule = await _rule_or_404(db, rule_id, project.id)
    if payload.name is not None:
        rule.name = payload.name
    if payload.enabled is not None:
        rule.enabled = payload.enabled
    await db.commit()
    return _rule_out(rule)


@router.delete(f"{_P}/automation-rules/{{rule_id}}/")
async def delete_automation(
    rule_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    rule = await _rule_or_404(db, rule_id, project.id)
    await db.delete(rule)
    await db.commit()
    return {"success": True}


@router.post(f"{_P}/automation-rules/{{rule_id}}/dry-run/", response_model=AutomationRunOut)
async def dry_run(
    rule_id: str,
    payload: DryRunIn,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    """Execute the rule against a sample event payload with ZERO side effects (GIN-254)."""
    rule = await _rule_or_404(db, rule_id, project.id)
    ast = AutomationAst.model_validate(rule.ast)
    taken = await execute_actions(db, ast, project=project, actor=ctx.user, story=None, dry_run=True)
    run = AutomationRun(
        automation_id=rule.id, project_id=project.id, trigger_event=rule.trigger_event,
        dry_run=True, status="dry_run", actions_taken=taken,
    )
    db.add(run)
    await db.commit()
    return _run_out(run)


@router.get(f"{_P}/automation-rules/{{rule_id}}/runs/", response_model=list[AutomationRunOut])
async def list_runs(
    rule_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    await _rule_or_404(db, rule_id, project.id)
    rows = (
        await db.execute(
            select(AutomationRun).where(AutomationRun.automation_id == rule_id)
            .order_by(AutomationRun.created_at.desc())
        )
    ).scalars().all()
    return [_run_out(r) for r in rows]
