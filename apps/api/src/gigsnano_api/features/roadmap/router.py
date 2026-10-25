"""AI Roadmap HTTP surface (GIN-206/207/208): Initiatives (workspace, cross-project
rollup), Milestones + Releases (project, target-date rollup + slip), agent drafting
from brief/PRD, and release changelog generation from shipped items."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.roadmap import service as S
from gigsnano_api.features.roadmap.drafter import (
    draft_changelog,
    draft_initiatives,
    draft_milestones,
)
from gigsnano_api.features.roadmap.schemas import (
    DraftIn,
    InitiativeIn,
    InitiativeOut,
    InitiativePatch,
    LinkIn,
    MilestoneIn,
    MilestoneOut,
    MilestonePatch,
    ReleaseIn,
    ReleaseOut,
    ReleasePatch,
    RollupOut,
)
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    Artifact,
    EArtifactStatus,
    ELlmUsageOperation,
    ELlmUsageSource,
    Project,
    Story,
)
from gigsnano_api.models.roadmap import Initiative, Milestone, Release
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["roadmap"])
_W = "/workspaces/{workspace_slug}"
_P = "/workspaces/{workspace_slug}/projects/{project_id}"


def _init_out(i: Initiative) -> InitiativeOut:
    return InitiativeOut(
        id=i.id, workspace_id=i.workspace_id, title=i.title, description=i.description,
        status=i.status, lead_id=i.lead_id, target_date=i.target_date, created_at=i.created_at,
    )


async def _milestone_out(db, m: Milestone) -> MilestoneOut:
    rollup = await S.rollup_for(db, Story.milestone_id, m.id, m.target_date)
    return MilestoneOut(
        id=m.id, project_id=m.project_id, initiative_id=m.initiative_id, name=m.name,
        description=m.description, status=m.status, target_date=m.target_date,
        rollup=RollupOut(**rollup), created_at=m.created_at,
    )


def _release_out(r: Release) -> ReleaseOut:
    return ReleaseOut(
        id=r.id, project_id=r.project_id, version=r.version, name=r.name,
        changelog_md=r.changelog_md, status=r.status, released_at=r.released_at, created_at=r.created_at,
    )


async def _artifact_text(db, project_id: str, doc_type: str) -> str:
    a = (await db.execute(
        select(Artifact).where(
            Artifact.project_id == project_id, Artifact.doc_type == doc_type,
            Artifact.status == EArtifactStatus.FINAL,
        ).order_by(Artifact.version.desc()).limit(1)
    )).scalars().first()
    return a.content_md if a else ""


async def _bill(db, ctx, project_id, in_tok, out_tok, is_fake):
    await record_llm_usage(
        db, workspace_id=ctx.workspace.id, user_id=ctx.user.id,
        source=ELlmUsageSource.ROADMAP, operation=ELlmUsageOperation.EXTRACT,
        model="fake" if is_fake else settings.anthropic_model,
        input_tokens=in_tok, output_tokens=out_tok, project_id=project_id, is_fake=is_fake,
    )


# ---- Initiatives (workspace, cross-project) --------------------------------

@router.get(f"{_W}/initiatives/", response_model=list[InitiativeOut])
async def list_initiatives(
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(
        select(Initiative).where(Initiative.workspace_id == ctx.workspace.id)
        .order_by(Initiative.created_at)
    )).scalars().all()
    return [_init_out(i) for i in rows]


@router.post(f"{_W}/initiatives/", response_model=InitiativeOut, status_code=status.HTTP_201_CREATED)
async def create_initiative(
    payload: InitiativeIn,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    init = Initiative(workspace_id=ctx.workspace.id, **payload.model_dump())
    db.add(init)
    await db.commit()
    return _init_out(init)


async def _own_initiative(db, initiative_id, ctx) -> Initiative:
    i = await db.get(Initiative, initiative_id)
    if i is None or i.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Initiative not found")
    return i


@router.patch(f"{_W}/initiatives/{{initiative_id}}/", response_model=InitiativeOut)
async def update_initiative(
    initiative_id: str, payload: InitiativePatch,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    init = await _own_initiative(db, initiative_id, ctx)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(init, k, v)
    await db.commit()
    return _init_out(init)


@router.delete(f"{_W}/initiatives/{{initiative_id}}/")
async def delete_initiative(
    initiative_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    init = await _own_initiative(db, initiative_id, ctx)
    await db.delete(init)
    await db.commit()
    return {"success": True}


@router.get(f"{_W}/initiatives/{{initiative_id}}/rollup/", response_model=RollupOut)
async def initiative_rollup(
    initiative_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    init = await _own_initiative(db, initiative_id, ctx)
    ids = await accessible_project_ids(db, ctx)
    return RollupOut(**await S.initiative_rollup(db, init, ids))


# ---- Milestones (project) --------------------------------------------------

@router.get(f"{_P}/milestones/", response_model=list[MilestoneOut])
async def list_milestones(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(
        select(Milestone).where(Milestone.project_id == project.id).order_by(Milestone.target_date)
    )).scalars().all()
    return [await _milestone_out(db, m) for m in rows]


@router.post(f"{_P}/milestones/", response_model=MilestoneOut, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    payload: MilestoneIn,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
):
    m = Milestone(project_id=project.id, **payload.model_dump())
    db.add(m)
    await db.commit()
    return await _milestone_out(db, m)


async def _own_milestone(db, milestone_id, project) -> Milestone:
    m = await db.get(Milestone, milestone_id)
    if m is None or m.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Milestone not found")
    return m


@router.patch(f"{_P}/milestones/{{milestone_id}}/", response_model=MilestoneOut)
async def update_milestone(
    milestone_id: str, payload: MilestonePatch,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
):
    m = await _own_milestone(db, milestone_id, project)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.commit()
    return await _milestone_out(db, m)


@router.delete(f"{_P}/milestones/{{milestone_id}}/")
async def delete_milestone(
    milestone_id: str,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    m = await _own_milestone(db, milestone_id, project)
    await db.delete(m)
    await db.commit()
    return {"success": True}


@router.post(f"{_P}/milestones/{{milestone_id}}/link/", response_model=MilestoneOut)
async def link_milestone(
    milestone_id: str, payload: LinkIn,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
):
    m = await _own_milestone(db, milestone_id, project)
    await db.execute(
        update(Story).where(Story.id.in_(payload.story_ids), Story.project_id == project.id)
        .values(milestone_id=m.id)
    )
    await db.commit()
    return await _milestone_out(db, m)


# ---- Releases (project) ----------------------------------------------------

@router.get(f"{_P}/releases/", response_model=list[ReleaseOut])
async def list_releases(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(
        select(Release).where(Release.project_id == project.id).order_by(Release.created_at.desc())
    )).scalars().all()
    return [_release_out(r) for r in rows]


@router.post(f"{_P}/releases/", response_model=ReleaseOut, status_code=status.HTTP_201_CREATED)
async def create_release(
    payload: ReleaseIn,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
):
    r = Release(project_id=project.id, **payload.model_dump())
    db.add(r)
    await db.commit()
    return _release_out(r)


async def _own_release(db, release_id, project) -> Release:
    r = await db.get(Release, release_id)
    if r is None or r.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Release not found")
    return r


@router.patch(f"{_P}/releases/{{release_id}}/", response_model=ReleaseOut)
async def update_release(
    release_id: str, payload: ReleasePatch,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
):
    r = await _own_release(db, release_id, project)
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(r, k, v)
    if changes.get("status") == "released" and r.released_at is None:
        r.released_at = utcnow()
    await db.commit()
    return _release_out(r)


@router.post(f"{_P}/releases/{{release_id}}/link/", response_model=ReleaseOut)
async def link_release(
    release_id: str, payload: LinkIn,
    project: Project = Depends(require_project_write_access), db: AsyncSession = Depends(get_db),
):
    r = await _own_release(db, release_id, project)
    await db.execute(
        update(Story).where(Story.id.in_(payload.story_ids), Story.project_id == project.id)
        .values(release_id=r.id)
    )
    await db.commit()
    return _release_out(r)


@router.post(f"{_P}/releases/{{release_id}}/changelog/", response_model=ReleaseOut)
async def generate_changelog(
    release_id: str,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """Scrum Master writes the changelog from the release's shipped (done) items (GIN-207)."""
    r = await _own_release(db, release_id, project)
    titles = await S.shipped_titles(db, r)
    if not titles:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No shipped work items linked to this release")
    draft, in_tok, out_tok, is_fake = await draft_changelog(llm, r.version, titles)
    r.changelog_md = draft.markdown
    await _bill(db, ctx, project.id, in_tok, out_tok, is_fake)
    await db.commit()
    return _release_out(r)


# ---- Agent drafting --------------------------------------------------------

@router.post(f"{_P}/roadmap/draft-initiatives/")
async def draft_initiatives_ep(
    payload: DraftIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict:
    """Analyst drafts initiatives from the project brief (GIN-207) — not saved."""
    text = payload.text or await _artifact_text(db, project.id, "brief")
    if not text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No brief available — finalize one or pass text")
    draft, in_tok, out_tok, is_fake = await draft_initiatives(llm, text)
    await _bill(db, ctx, project.id, in_tok, out_tok, is_fake)
    await db.commit()
    return draft.model_dump()


@router.post(f"{_P}/roadmap/draft-milestones/")
async def draft_milestones_ep(
    payload: DraftIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict:
    """PM drafts milestones from the project PRD (GIN-207) — not saved."""
    text = payload.text or await _artifact_text(db, project.id, "prd")
    if not text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No PRD available — finalize one or pass text")
    draft, in_tok, out_tok, is_fake = await draft_milestones(llm, text)
    await _bill(db, ctx, project.id, in_tok, out_tok, is_fake)
    await db.commit()
    return draft.model_dump()
