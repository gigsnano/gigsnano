import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.context_engine.graph import queries, store
from gigsnano_api.core.db import get_db
from gigsnano_api.features.code_index.schemas import CodebaseOverviewOut, IndexStatusOut
from gigsnano_api.models import ECloneStatus, ECodeArtifactKind, EIndexStatus, Project
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)
from gigsnano_api.workspace.code_artifacts import load_artifact, load_artifacts, save_artifact
from gigsnano_api.workspace.code_index import run_index_in_fresh_session
from gigsnano_api.workspace.er_extract import generate_er_schema, parse_dbml
from gigsnano_api.workspace.graph_view import aggregate_communities
from gigsnano_api.workspace.metrics import empty_metrics
from gigsnano_api.workspace.overview import assemble_overview
from gigsnano_api.workspace.paths import index_dir, workspace_root

router = APIRouter(tags=["code-index"])


def _serialize(project: Project) -> IndexStatusOut:
    return IndexStatusOut(
        project_id=project.id,
        index_status=project.index_status.value,
        index_error=project.index_error,
        indexed_commit_sha=project.indexed_commit_sha,
    )


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/index/",
    response_model=IndexStatusOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_index(
    background: BackgroundTasks,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> IndexStatusOut:
    if project.clone_status != ECloneStatus.READY:
        raise HTTPException(status_code=409, detail="Repository is not cloned yet.")
    project.index_status = EIndexStatus.PENDING
    project.index_error = None
    await db.commit()
    background.add_task(run_index_in_fresh_session, project.id)
    return _serialize(project)


class ParseDbmlIn(BaseModel):
    dbml: str


@router.post("/workspaces/{workspace_slug}/projects/{project_id}/code/parse-dbml/")
async def parse_dbml_endpoint(
    payload: ParseDbmlIn,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    return parse_dbml(payload.dbml)


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/code/graph/")
async def get_code_graph(
    view: str = "auto",
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    row = await load_artifact(db, project.id, ECodeArtifactKind.GRAPH)
    graph = row.data if row is not None else {"nodes": [], "edges": []}
    return aggregate_communities(graph) if view != "full" else graph


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/code/er/")
async def get_code_er(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The project's ER schema, extracted from a committed .dbml/Prisma schema at
    index time. Empty `tables` means no schema source was detected — the frontend
    then offers to generate one with the Architect. 409s pre-index."""
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    row = await load_artifact(db, project.id, ECodeArtifactKind.ER)
    schema = row.data if row is not None else {"tables": [], "relations": []}
    return {
        "id": f"er-{project.id}",
        "tables": schema.get("tables", []),
        "relations": schema.get("relations", []),
        "based_on_sha": project.indexed_commit_sha,
    }


@router.post("/workspaces/{workspace_slug}/projects/{project_id}/code/er/generate/")
async def generate_code_er(
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Analyze the repo's DB models on demand and (re)generate the ER schema
    (GIN-86): committed .dbml/Prisma if present, else infer from SQLAlchemy/Django
    model classes. Read-only over the clone — the repo is NEVER modified. The result
    is persisted as the durable `er` artifact. Same shape as GET code/er/."""
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    schema = await asyncio.to_thread(
        generate_er_schema, workspace_root(project.id), index_dir(project.id)
    )
    await save_artifact(db, project.id, ECodeArtifactKind.ER, schema, project.indexed_commit_sha)
    await db.commit()
    return {
        "id": f"er-{project.id}",
        "tables": schema.get("tables", []),
        "relations": schema.get("relations", []),
        "based_on_sha": project.indexed_commit_sha,
    }


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/code/metrics/")
async def get_code_metrics(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    row = await load_artifact(db, project.id, ECodeArtifactKind.METRICS)
    return row.data if row is not None else empty_metrics()


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/code/issues/")
async def get_code_issues(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The project's full Semgrep findings. Separate from
    `code/metrics/` because that payload is handed to the LLM whole and carries only
    a capped summary; this one backs the faceted Issues screen.

    `scanned` distinguishes "semgrep never ran" (no artifact) from "ran and found
    nothing" -- both would otherwise be an empty list."""
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    row = await load_artifact(db, project.id, ECodeArtifactKind.ISSUES)
    if row is None:
        return {"issues": [], "truncated": False, "scanned": False}
    return {**row.data, "scanned": True}


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/code/overview/",
    response_model=CodebaseOverviewOut,
)
async def get_code_overview(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> CodebaseOverviewOut:
    """Actionable repository-intelligence summary backing the Codebase Overview
    dashboard (GIN-272). Unlike every other code endpoint this NEVER 409s — it
    returns 200 in every index state (none/pending/indexing/failed/ready) so the UI
    renders an honest indexing/unavailable/stale surface instead of a blank error.
    Fans in the persisted graph/metrics/issues/changes artifacts in one query; a
    missing analyzer degrades only its own section, never the whole page."""
    arts = await load_artifacts(db, project.id)

    def _data(kind: ECodeArtifactKind):
        row = arts.get(kind)
        return (row.data if row else None), (row.built_at if row else None)

    graph, graph_at = _data(ECodeArtifactKind.GRAPH)
    metrics, metrics_at = _data(ECodeArtifactKind.METRICS)
    issues, _ = _data(ECodeArtifactKind.ISSUES)
    changes, changes_at = _data(ECodeArtifactKind.CHANGES)
    data = assemble_overview(
        status=project.index_status,
        index_error=project.index_error,
        repo_full_name=project.repo_full_name,
        branch=project.repo_default_branch,
        indexed_sha=project.indexed_commit_sha,
        indexed_at=project.indexed_at,
        graph=graph,
        metrics=metrics,
        issues=issues,
        changes=changes,
        graph_built_at=graph_at,
        metrics_built_at=metrics_at,
        changes_built_at=changes_at,
    )
    return CodebaseOverviewOut.model_validate(data)


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/code/symbols/{node_id}/traceability/")
async def get_symbol_traceability(
    node_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """SDLC traceability for a code symbol (GIA-15): the stories that directly
    modify it, plus the stories impacted if it changes (business-context impact).
    Empty when the SDLC graph hasn't been projected for this project."""
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    if not store.available():
        return {"stories": [], "impacted": []}
    return {
        "stories": queries.stories_for_symbol(project.id, node_id),
        "impacted": queries.impacted_stories(project.id, node_id),
    }


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/code/stories/{story_node_id}/trace/")
async def get_story_trace(
    story_node_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """PRD/doc → Story → code chain rooted at a story graph node (GIA-15)."""
    if project.index_status != EIndexStatus.READY:
        raise HTTPException(status_code=409, detail="Code index is not ready.")
    if not store.available():
        return {"documents": [], "symbols": []}
    return queries.trace_chain(project.id, story_node_id)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/index/retry/",
    response_model=IndexStatusOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_index(
    background: BackgroundTasks,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> IndexStatusOut:
    if project.clone_status != ECloneStatus.READY:
        raise HTTPException(status_code=409, detail="Repository is not cloned yet.")
    project.index_status = EIndexStatus.PENDING
    project.index_error = None
    await db.commit()
    background.add_task(run_index_in_fresh_session, project.id)
    return _serialize(project)
