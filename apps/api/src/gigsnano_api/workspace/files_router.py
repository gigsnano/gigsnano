"""Read-only browsing of a project's physical workspace (`.workspaces/<project_id>/`) —
the cloned brownfield repo and/or generated BMAD docs. Any project member can read."""

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import ECloneStatus, Project
from gigsnano_api.shared.context import get_project_or_404, get_workspace_context
from gigsnano_api.sync.github_oauth import GitHubOAuth, get_github_oauth
from gigsnano_api.workspace.clone import run_clone_in_fresh_session
from gigsnano_api.workspace.paths import workspace_root

router = APIRouter(tags=["workspace"])

MAX_TREE_ENTRIES = 2000
MAX_INLINE_SIZE = 1_000_000
BINARY_PREVIEW = "(binary or file too large to preview)"


class WorkspaceEntry(BaseModel):
    path: str
    is_dir: bool
    size: int | None


class WorkspaceFileOut(BaseModel):
    path: str
    content: str


def _has_workspace_files(root: Path) -> bool:
    """True if the workspace holds any non-`.git` entry. A bare/`.git`-only dir
    counts as empty — the same exclusion the tree walk applies."""
    if not root.is_dir():
        return False
    for path in root.rglob("*"):
        if ".git" in path.relative_to(root).parts:
            continue
        return True
    return False


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/workspace/tree/",
    response_model=list[WorkspaceEntry],
    dependencies=[Depends(get_workspace_context)],
)
async def get_workspace_tree(
    background: BackgroundTasks,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
):
    root = workspace_root(project.id)

    # Self-heal a DB/filesystem divergence: a brownfield project the DB still
    # marks READY but whose cloned files are gone. Workspaces live on the
    # container's ephemeral disk, so a redeploy/restart (or a scaled-out
    # instance that never ran the clone) wipes them while clone_status stays
    # READY in Postgres — leaving the repo view permanently empty. Flip back to
    # PENDING and re-clone; the client polls PENDING and repopulates. Guarded to
    # READY-with-a-repo so greenfield projects (legitimately empty) and in-flight
    # clones (PENDING/CLONING) never trigger a redundant re-clone.
    if (
        project.repo_full_name
        and project.clone_status == ECloneStatus.READY
        and not _has_workspace_files(root)
    ):
        project.clone_status = ECloneStatus.PENDING
        project.clone_error = None
        await db.commit()
        background.add_task(run_clone_in_fresh_session, oauth, project.id)
        return []

    if not root.is_dir():
        return []

    entries: list[WorkspaceEntry] = []
    for path in sorted(root.rglob("*")):
        if ".git" in path.relative_to(root).parts:
            continue
        rel = path.relative_to(root).as_posix()
        is_dir = path.is_dir()
        entries.append(
            WorkspaceEntry(
                path=rel,
                is_dir=is_dir,
                size=None if is_dir else path.stat().st_size,
            )
        )
        if len(entries) >= MAX_TREE_ENTRIES:
            break
    return entries


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/workspace/file/",
    response_model=WorkspaceFileOut,
    dependencies=[Depends(get_workspace_context)],
)
async def get_workspace_file(path: str, project: Project = Depends(get_project_or_404)):
    if ".." in path.replace("\\", "/").split("/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Illegal path")

    root = workspace_root(project.id).resolve()
    target = (root / path).resolve()
    try:
        target.relative_to(root)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path escapes workspace root") from err

    if not target.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    raw = target.read_bytes()
    looks_binary = b"\x00" in raw[:8192]
    if looks_binary or len(raw) > MAX_INLINE_SIZE:
        content = BINARY_PREVIEW
    else:
        content = raw.decode("utf-8", errors="replace")

    return WorkspaceFileOut(path=path, content=content)
