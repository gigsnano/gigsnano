"""Workspace-level AI assistant: turn a free-form prompt (e.g. a work-item title)
into a description via the LLM provider seam. No DB writes, no thread, no usage
recording — a stateless, membership-gated sibling of the BMAD finalize-description
flow (`bmad/generate_description.py`).

When a `project_id` is supplied, the generation is grounded in that project's
context (name/overview/story-counts + existing work-item titles) so the output
reflects the project rather than expanding the title generically."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing.enforcement import ensure_positive_balance
from gigsnano_api.bmad.generate_description import (
    GenerateDescriptionFailed,
    run_generate_description,
)
from gigsnano_api.bmad.provider import FakeProvider, LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.features.ai_assistant.schemas import AiAssistantOut, AiAssistantPayload
from gigsnano_api.features.gigs_ai.prompt import gather_gigs_context
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    ELlmUsageOperation,
    ELlmUsageSource,
    Project,
    Story,
    Workspace,
)
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    get_workspace_context,
    user_is_project_member,
)

router = APIRouter(tags=["ai-assistant"])

MAX_CONTEXT_STORIES = 40


async def _project_context(db: AsyncSession, workspace: Workspace, project_id: str) -> str:
    """Compact, workspace-scoped project context for grounding the generation:
    the shared gigs context block plus existing work-item titles."""
    context = await gather_gigs_context(db, workspace, project_id)
    titles = (
        await db.execute(
            select(Story.title)
            .join(Project, Project.id == Story.project_id)
            .where(Story.project_id == project_id, Project.workspace_id == workspace.id)
            .order_by(Story.sort_order)
            .limit(MAX_CONTEXT_STORIES)
        )
    ).scalars().all()
    if titles:
        context += "\n\nExisting work items in this project:\n" + "\n".join(
            f"- {t}" for t in titles
        )
    return context


@router.post(
    "/workspaces/{workspace_slug}/ai-assistant/",
    response_model=AiAssistantOut,
)
async def ai_assistant(
    workspace_slug: str,
    payload: AiAssistantPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> AiAssistantOut:
    context = None
    if payload.project_id:
        project = await db.get(Project, payload.project_id)
        if project is None or project.workspace_id != ctx.workspace.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        if ctx.role not in ADMINS and not await user_is_project_member(
            db, ctx.user.id, project.id
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        context = await _project_context(db, ctx.workspace, payload.project_id)
    # Billing AFTER the project-access check above, so a non-member 404s (not 402).
    is_fake = isinstance(llm, FakeProvider)
    if not is_fake:
        await ensure_positive_balance(db, ctx.workspace.id)
    try:
        html, result = await run_generate_description(
            llm, prompt=payload.prompt, task=payload.task, context=context
        )
    except GenerateDescriptionFailed:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The assistant could not generate a description. Try again.",
        )
    # Record usage so the wallet is debited (GIN-32) — mirrors the finalize-description
    # flow. A real provider debits; FakeProvider records a null-cost event only.
    await record_llm_usage(
        db,
        workspace_id=ctx.workspace.id,
        user_id=ctx.user.id,
        source=ELlmUsageSource.GIGS_AI,
        operation=ELlmUsageOperation.EXTRACT,
        model=settings.anthropic_model if not is_fake else "fake",
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        project_id=payload.project_id,
        is_fake=is_fake,
    )
    await db.commit()
    return AiAssistantOut(response_html=html)
