"""Transition-gate evaluation (GIN-220). On a status change, find the matching
enabled WorkflowRule; a PERSONA approver reviews the work item (one-shot LLM
verdict, reusing the intake extract loop + EReadinessResult vocabulary), a HUMAN
approver requires the actor to hold the named role. Records a GateDecision either
way. Returns (decision, allowed); the caller maps `not allowed` to a 409 block."""

from typing import Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import FakeProvider, LLMProvider
from gigsnano_api.core.config import settings
from gigsnano_api.features.agents.router import BMAD_AGENTS
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource
from gigsnano_api.models.stories import EReadinessResult, EStoryStatus
from gigsnano_api.models.workflows import (
    EApproverKind,
    EGateConcernPolicy,
    GateDecision,
    WorkflowRule,
)

_PERSONA = {a["id"]: a for a in BMAD_AGENTS}
_ROLE_RANK = {"viewer": 0, "guest": 1, "member": 2, "admin": 3, "owner": 4}
_MAX_ATTEMPTS = 3


class _Verdict(BaseModel):
    verdict: Literal["pass", "concerns", "fail"] = "pass"
    rationale: str = Field(default="", description="One or two sentences justifying the verdict")


async def _find_rule(
    db: AsyncSession, project_id: str, from_status: str, to_status: str
) -> WorkflowRule | None:
    rules = (
        await db.execute(
            select(WorkflowRule).where(
                WorkflowRule.project_id == project_id,
                WorkflowRule.to_status == to_status,
                WorkflowRule.enabled.is_(True),
            )
        )
    ).scalars().all()
    # Prefer an exact from-match over an any-from ("") rule.
    exact = next((r for r in rules if r.from_status == from_status), None)
    return exact or next((r for r in rules if r.from_status == ""), None)


async def _persona_review(
    provider: LLMProvider, persona_id: str, story, from_status: str, to_status: str
) -> tuple[str, str, int, int, bool]:
    agent = _PERSONA.get(persona_id, {})
    system = [{"type": "text", "text": (
        f"You are {agent.get('name', 'the reviewer')} ({agent.get('persona', '')}), "
        f"gating a work item's transition from '{from_status}' to '{to_status}'. "
        f"{agent.get('description', '')}\n"
        "Review the work item and return PASS (ready), CONCERNS (proceed with caveats), "
        "or FAIL (not ready — blocks the move), with a short rationale. Judge only what's "
        "written; if there is not enough detail to be confident, return CONCERNS."
    )}]
    messages = [{"role": "user", "content": (
        f"Work item: {story.title}\n\n{story.description or '(no description)'}"
    )}]
    for _ in range(_MAX_ATTEMPTS):
        result = await provider.extract(
            system=system, messages=messages,
            tool_name="emit_verdict", schema=_Verdict.model_json_schema(),
        )
        try:
            v = _Verdict.model_validate(result.data)
            return v.verdict, v.rationale, result.input_tokens or 0, result.output_tokens or 0, \
                isinstance(provider, FakeProvider)
        except ValidationError:
            messages = messages + [
                {"role": "assistant", "content": "emit_verdict was invalid."},
                {"role": "user", "content": "Emit again with a valid verdict."},
            ]
    return "concerns", "Reviewer could not produce a verdict.", 0, 0, isinstance(provider, FakeProvider)


def _blocked(verdict: str, on_concerns: str) -> bool:
    if verdict == EReadinessResult.FAIL.value:
        return True
    if verdict == EReadinessResult.CONCERNS.value:
        return on_concerns == EGateConcernPolicy.BLOCK.value
    return False


async def evaluate_gate(
    db: AsyncSession, provider: LLMProvider, project, story, to_status: EStoryStatus,
    *, actor, actor_role,
) -> tuple[GateDecision | None, bool]:
    """Returns (decision, allowed). (None, True) when no rule gates this transition."""
    from_status = story.status.value
    rule = await _find_rule(db, project.id, from_status, to_status.value)
    if rule is None:
        return None, True

    if rule.approver_kind == EApproverKind.HUMAN.value:
        role_val = getattr(actor_role, "value", str(actor_role))
        ok = _ROLE_RANK.get(role_val, 0) >= _ROLE_RANK.get(rule.approver_ref, 99)
        verdict = EReadinessResult.PASS.value if ok else EReadinessResult.FAIL.value
        rationale = (
            f"{role_val} satisfies required role {rule.approver_ref}." if ok
            else f"Transition requires role {rule.approver_ref}; you are {role_val}."
        )
        allowed = ok
    else:  # PERSONA
        verdict, rationale, in_tok, out_tok, is_fake = await _persona_review(
            provider, rule.approver_ref, story, from_status, to_status.value
        )
        await record_llm_usage(
            db, workspace_id=project.workspace_id, user_id=actor.id,
            source=ELlmUsageSource.GATE, operation=ELlmUsageOperation.EXTRACT,
            model="fake" if is_fake else settings.anthropic_model,
            input_tokens=in_tok, output_tokens=out_tok,
            project_id=project.id, story_id=story.id, is_fake=is_fake,
        )
        allowed = not _blocked(verdict, rule.on_concerns)

    decision = GateDecision(
        story_id=story.id, rule_id=rule.id, from_status=from_status, to_status=to_status.value,
        approver_kind=rule.approver_kind, approver_ref=rule.approver_ref,
        verdict=verdict, allowed=allowed, rationale=rationale, actor_id=actor.id,
    )
    db.add(decision)
    await db.flush()
    return decision, allowed
