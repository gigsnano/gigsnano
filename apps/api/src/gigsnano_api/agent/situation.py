"""Compute the compact 'situation' the harness routes on: repo/index/docs/surface/state."""

from __future__ import annotations

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.context_engine.graph import store as ce_store
from gigsnano_api.models import Artifact, ECloneStatus, EIndexStatus, Project, Workspace


async def build_situation(
    db: AsyncSession,
    workspace: Workspace,
    project_id: str | None,
    surface: str,
    thread_state: str | None = None,
) -> str:
    parts = [f'Situation: workspace "{workspace.name}"']
    if not project_id:
        parts.append(f"· no project in scope · surface {surface}")
        return " ".join(parts)
    proj = await db.get(Project, project_id)
    if proj is None or proj.workspace_id != workspace.id:
        return " ".join(parts + [f"· surface {surface}"])
    parts.append(
        f'· project "{proj.name}" ({proj.identifier}, id: {proj.id}) · surface {surface}'
        + (f" ({thread_state})" if thread_state else "")
    )
    # repo + index
    if proj.repo_full_name:
        index_ready = (
            proj.index_status == EIndexStatus.READY
            and ce_store.available()
            and ce_store.count_nodes(proj.id) > 0
        )
        if index_ready:
            state = "index ready @ " + (proj.indexed_commit_sha or "?")[:7]
        elif proj.clone_status == ECloneStatus.READY:
            state = "cloned, index not ready"
        else:
            state = f"clone {proj.clone_status.value}"
        parts.append(f"\nRepo: connected ({proj.repo_full_name}), {state}")
    else:
        parts.append("\nRepo: not connected")
    # documents
    doc_types = (
        await db.execute(select(distinct(Artifact.doc_type)).where(Artifact.project_id == proj.id))
    ).scalars().all()
    parts.append(f"· Docs: {', '.join(sorted(doc_types)) if doc_types else 'none'} present")
    return " ".join(parts)
