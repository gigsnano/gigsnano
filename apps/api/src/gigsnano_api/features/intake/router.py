"""Smart Intake HTTP surface (GIN-213/214/215/216).

Authenticated: Customer CRUD + the triage queue (capture / process / accept /
dismiss). Unauthenticated: a rate-limited public-form submit scoped by a signed
workspace token (no login, no workspace-id enumeration) — the only route here
that skips get_current_user, so it never trusts a client-supplied workspace id.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.core.rate_limit import limiter
from gigsnano_api.email.tokens import EmailTokenError, make_email_token, verify_email_token
from gigsnano_api.features.agent_runs.live import run_agent_run_in_fresh_session
from gigsnano_api.features.agent_runs.resources import PersonaAtCapacity
from gigsnano_api.features.intake import service as S
from gigsnano_api.features.intake.engine import process_triage_item
from gigsnano_api.features.intake.schemas import (
    CustomerIn,
    CustomerOut,
    PublicIntakeIn,
    TriageAcceptIn,
    TriageCaptureIn,
    TriageItemOut,
)
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, Project, Workspace
from gigsnano_api.models.intake import ETriageSource, ETriageStatus, TriageItem
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    get_workspace_context,
    require_role,
)

router = APIRouter(tags=["intake"])

_INTAKE_TOKEN_TTL = 365 * 24 * 3600  # a public form link lives a year


def _customer_out(c) -> CustomerOut:
    return CustomerOut(id=c.id, name=c.name, email=c.email,
                       priority_weight=c.priority_weight, notes=c.notes, created_at=c.created_at)


def _item_out(i: TriageItem, slug: str) -> TriageItemOut:
    return TriageItemOut(
        id=i.id, workspace_slug=slug, project_id=i.project_id, source=i.source.value,
        is_public=i.is_public, status=i.status.value, title=i.title, body=i.body,
        customer_id=i.customer_id, classification=i.classification,
        enriched_title=i.enriched_title, enriched_description=i.enriched_description,
        priority=i.priority, duplicate_ids=i.duplicate_ids,
        recommended_route=i.recommended_route, created_story_id=i.created_story_id,
        created_at=i.created_at, updated_at=i.updated_at,
    )


async def _item_or_404(db: AsyncSession, item_id: str, workspace_id: str) -> TriageItem:
    item = await db.get(TriageItem, item_id)
    if item is None or item.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Triage item not found")
    return item


# ---- Customers -------------------------------------------------------------

@router.get("/workspaces/{workspace_slug}/customers/", response_model=list[CustomerOut])
async def list_customers(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return [_customer_out(c) for c in await S.list_customers(db, ctx.workspace.id)]


@router.post("/workspaces/{workspace_slug}/customers/", response_model=CustomerOut,
             status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerIn,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    customer = await S.create_customer(
        db, workspace_id=ctx.workspace.id, actor_id=ctx.user.id,
        name=payload.name, email=payload.email,
        priority_weight=payload.priority_weight, notes=payload.notes,
    )
    await db.commit()
    return _customer_out(customer)


# ---- Triage queue ----------------------------------------------------------

@router.get("/workspaces/{workspace_slug}/triage/", response_model=list[TriageItemOut])
async def list_triage(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    items = await S.list_triage(db, ctx.workspace.id, viewer_id=ctx.user.id)
    return [_item_out(i, ctx.workspace.slug) for i in items]


@router.post("/workspaces/{workspace_slug}/triage/", response_model=TriageItemOut,
             status_code=status.HTTP_201_CREATED)
async def capture(
    payload: TriageCaptureIn,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    item = await S.capture(
        db, workspace_id=ctx.workspace.id, source=ETriageSource(payload.source),
        title=payload.title, body=payload.body, is_public=payload.is_public,
        project_id=payload.project_id, customer_id=payload.customer_id, created_by_id=ctx.user.id,
    )
    await db.commit()
    return _item_out(item, ctx.workspace.slug)


@router.post("/workspaces/{workspace_slug}/triage/{item_id}/process/", response_model=TriageItemOut)
async def process(
    item_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """Run the Analyst engine: classify, dedupe, enrich, prioritize, route. Billed
    to the member who triaged (an on-demand AI call, like the BMAD chat)."""
    item = await _item_or_404(db, item_id, ctx.workspace.id)
    weight = await S.customer_weight(db, item)
    item, in_tok, out_tok, is_fake = await process_triage_item(db, llm, item, customer_weight=weight)
    await record_llm_usage(
        db, workspace_id=ctx.workspace.id, user_id=ctx.user.id,
        source=ELlmUsageSource.INTAKE, operation=ELlmUsageOperation.EXTRACT,
        model="fake" if is_fake else settings.anthropic_model,
        input_tokens=in_tok, output_tokens=out_tok, project_id=item.project_id, is_fake=is_fake,
    )
    await db.commit()
    return _item_out(item, ctx.workspace.slug)


@router.post("/workspaces/{workspace_slug}/triage/{item_id}/accept/", response_model=TriageItemOut)
async def accept(
    item_id: str,
    payload: TriageAcceptIn,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """One-click accept: publish the enriched draft into a Story and route it to a
    persona (start a live run), a team member, or leave it for the marketplace flow."""
    item = await _item_or_404(db, item_id, ctx.workspace.id)
    if item.status == ETriageStatus.ACCEPTED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already accepted")
    project_id = payload.project_id or item.project_id
    if not project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A target project is required to accept")
    project = await db.get(Project, project_id)
    if project is None or project.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    try:
        story, run = await S.accept(
            db, item, project, ctx.user,
            route=payload.route, assignee_id=payload.assignee_id, status=payload.status,
        )
    except PersonaAtCapacity as e:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Persona {e} is at capacity") from None
    await db.commit()
    if run is not None:
        background.add_task(
            run_agent_run_in_fresh_session, run.id,
            user_id=ctx.user.id, workspace_id=ctx.workspace.id,
        )
    return _item_out(item, ctx.workspace.slug)


@router.post("/workspaces/{workspace_slug}/triage/{item_id}/dismiss/", response_model=TriageItemOut)
async def dismiss(
    item_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    item = await _item_or_404(db, item_id, ctx.workspace.id)
    item.status = ETriageStatus.DISMISSED
    await db.commit()
    return _item_out(item, ctx.workspace.slug)


# ---- Public intake ---------------------------------------------------------

@router.post("/workspaces/{workspace_slug}/intake-link/")
async def create_intake_link(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
) -> dict:
    """Admin-only: mint a signed, workspace-scoped public-form token (no DB row)."""
    token = make_email_token("intake", ctx.workspace.id, ttl_seconds=_INTAKE_TOKEN_TTL)
    return {"token": token, "url": f"{settings.app_base_url}/intake/{token}"}


@router.post("/public/intake/{token}/", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def public_intake(
    request: Request,
    token: str,
    payload: PublicIntakeIn,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Unauthenticated public-form submit. The workspace comes from the signed
    token — never a client-supplied id. Rate-limited (abuse is a trust boundary)."""
    try:
        workspace_id = verify_email_token("intake", token)
    except EmailTokenError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired intake link") from None
    if await db.get(Workspace, workspace_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    body = payload.body
    if payload.email:
        body = f"From: {payload.email}\n\n{body}"  # keep the reporter without spawning a Customer
    await S.capture(
        db, workspace_id=workspace_id, source=ETriageSource.PUBLIC_FORM,
        title=payload.title, body=body, is_public=True,
    )
    await db.commit()
    return {"received": True}
