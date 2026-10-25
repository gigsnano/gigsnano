"""Workflow-gate configuration + audit (GIN-220): per-project transition rules
(who approves a status move) and the read-only history of gate decisions."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.workflows.schemas import (
    GateDecisionOut,
    WorkflowRuleIn,
    WorkflowRuleOut,
)
from gigsnano_api.models import Project, Story
from gigsnano_api.models.workflows import GateDecision, WorkflowRule
from gigsnano_api.shared.context import get_project_or_404, require_project_write_access

router = APIRouter(tags=["workflows"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"


def _rule_out(r: WorkflowRule) -> WorkflowRuleOut:
    return WorkflowRuleOut(
        id=r.id, from_status=r.from_status, to_status=r.to_status,
        approver_kind=r.approver_kind, approver_ref=r.approver_ref,
        on_concerns=r.on_concerns, enabled=r.enabled, created_at=r.created_at,
    )


@router.get(f"{_P}/workflow-rules/", response_model=list[WorkflowRuleOut])
async def list_rules(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(select(WorkflowRule).where(WorkflowRule.project_id == project.id))
    ).scalars().all()
    return [_rule_out(r) for r in rows]


@router.post(f"{_P}/workflow-rules/", response_model=WorkflowRuleOut,
             status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: WorkflowRuleIn,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    rule = WorkflowRule(
        project_id=project.id, from_status=payload.from_status, to_status=payload.to_status,
        approver_kind=payload.approver_kind, approver_ref=payload.approver_ref,
        on_concerns=payload.on_concerns, enabled=payload.enabled,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)


@router.delete(f"{_P}/workflow-rules/{{rule_id}}/")
async def delete_rule(
    rule_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    rule = await db.get(WorkflowRule, rule_id)
    if rule is None or rule.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"success": True}


@router.get(f"{_P}/stories/{{story_id}}/gate-decisions/", response_model=list[GateDecisionOut])
async def list_gate_decisions(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    story = await db.get(Story, story_id)
    if story is None or story.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    rows = (
        await db.execute(
            select(GateDecision).where(GateDecision.story_id == story_id)
            .order_by(GateDecision.created_at.desc())
        )
    ).scalars().all()
    return [
        GateDecisionOut(
            id=d.id, story_id=d.story_id, from_status=d.from_status, to_status=d.to_status,
            approver_kind=d.approver_kind, approver_ref=d.approver_ref, verdict=d.verdict,
            allowed=d.allowed, rationale=d.rationale, created_at=d.created_at,
        )
        for d in rows
    ]
