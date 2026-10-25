"""Per-project code index over the cloned repo: the context-engine SCIP/FalkorDB
graph when enabled, else a fake file-only index. Mirrors workspace/clone.py."""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.config import settings
from gigsnano_api.core.db import async_session, utcnow
from gigsnano_api.models import ECloneStatus, EIndexStatus, Project
from gigsnano_api.workspace.clone import _redact
from gigsnano_api.workspace.paths import ensure_index_dir, workspace_root

if TYPE_CHECKING:
    from gigsnano_api.sync.github_oauth import GitHubOAuth

logger = logging.getLogger(__name__)

_CODE_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".rb", ".php", ".cs"}


# The clone lands on a mounted volume (Azure Files) that presents files as owned by
# a different uid than the container user, so git's ownership guard refuses a plain
# `git rev-parse` with "detected dubious ownership" — even though the clone itself
# succeeded. `-c safe.directory=*` tells git to trust the workspace tree (GIN-371).
_GIT_SAFE = ["-c", "safe.directory=*"]


def _git_head(repo_dir: Path) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *_GIT_SAFE, "rev-parse", "HEAD"],
        cwd=str(repo_dir),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        timeout=15,
        check=False,
    )


def head_commit_sha(repo_dir: Path) -> str | None:
    """`git rev-parse HEAD` in the clone; None on any failure (shallow clone still has HEAD)."""
    try:
        completed = _git_head(repo_dir)
    except Exception:  # noqa: BLE001 - best effort
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout.decode("utf-8", "replace").strip() or None


def head_read_error(repo_dir: Path) -> str:
    """git's own reason HEAD couldn't be read, for a diagnostic index_error (prod has
    no container logs, so the failure reason has to ride the error message)."""
    try:
        completed = _git_head(repo_dir)
    except Exception as err:  # noqa: BLE001
        return f"git unavailable: {err}"[:200]
    if completed.returncode == 0:
        return "HEAD readable"
    return (completed.stderr.decode("utf-8", "replace").strip() or "no HEAD; empty output")[:200]


def recent_commits(repo_dir: Path, limit: int = 20) -> list[dict]:
    """Latest commits as [{sha, author, email, message, committed_at}] via a single
    `git log`. [] on any failure or an empty/shallow history — the overview then
    renders "change history unavailable" rather than an invented feed. Persisted at
    index time so a read never has to shell out (and works on a clone-less replica).

    Uses a unit-separator (\\x1f) field delimiter and a record-separator (\\x1e) between
    commits so commit subjects containing tabs/newlines can't corrupt the parse."""
    fmt = "%H%x1f%an%x1f%ae%x1f%cI%x1f%s%x1e"
    try:
        completed = subprocess.run(
            ["git", *_GIT_SAFE, "log", f"-n{limit}", f"--pretty=format:{fmt}"],
            cwd=str(repo_dir),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=15,
            check=False,
        )
    except Exception:  # noqa: BLE001 - best effort
        return []
    if completed.returncode != 0:
        return []
    out = completed.stdout.decode("utf-8", "replace")
    commits: list[dict] = []
    for record in out.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        parts = record.split("\x1f")
        if len(parts) != 5:
            continue
        sha, author, email, committed_at, message = parts
        commits.append(
            {
                "sha": sha,
                "author": author,
                "email": email,
                "committed_at": committed_at or None,
                "message": message,
            }
        )
    return commits


def _fake_build(repo_dir: Path, out_dir: Path) -> None:
    """Deterministic keyless index: one node per code file, no edges.

    Not a real call graph -- just enough for tests and keyless dev to exercise the
    tool layer. When `context_engine_enabled`, `build_code_index` below uses the
    real SCIP-derived code graph instead.
    """
    nodes = []
    for p in sorted(repo_dir.rglob("*")):
        if p.is_file() and p.suffix in _CODE_EXTS:
            rel = p.relative_to(repo_dir).as_posix()
            nodes.append({"id": rel, "label": p.stem, "source_file": rel, "kind": "file"})
    graph = {"nodes": nodes, "edges": []}
    (out_dir / "graph.json").write_text(json.dumps(graph), encoding="utf-8")


def build_code_index(repo_dir: Path, out_dir: Path, project_id: str | None = None) -> None:
    """Build graph.json for repo_dir into out_dir. Context-engine when enabled, else fake."""
    if settings.context_engine_enabled:
        from gigsnano_api.context_engine.index import build_context_index

        build_context_index(repo_dir, out_dir, project_id=project_id or out_dir.parent.name)
    else:
        _fake_build(repo_dir, out_dir)


async def index_repo(
    db: AsyncSession,
    project_id: str,
    *,
    resync: bool = False,
    oauth: "GitHubOAuth | None" = None,
) -> None:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        return
    project.index_status = EIndexStatus.INDEXING
    project.index_error = None
    await db.commit()
    try:
        if project.clone_status != ECloneStatus.READY:
            raise RuntimeError("repository is not cloned yet")
        repo_dir = workspace_root(project_id)
        # Re-index self-heals a workspace whose clone isn't usable: on shared/mounted
        # storage the folder can exist but hold no repo (never populated on this host,
        # or wiped on redeploy → no `.git`), OR `.git` is present but headless/corrupt
        # so no HEAD resolves (GIN-371). A shallow clone still has a HEAD, so a missing
        # HEAD specifically signals a broken clone — re-clone in both cases. A valid
        # local clone (readable HEAD) is never clobbered.
        if resync and project.repo_full_name:
            git_dir = repo_dir / ".git"
            broken_clone = not git_dir.is_dir() or (
                await asyncio.to_thread(head_commit_sha, repo_dir)
            ) is None
            if broken_clone:
                from gigsnano_api.workspace.clone import populate_workspace

                if oauth is None:
                    from gigsnano_api.sync.github_oauth import build_oauth

                    oauth = build_oauth()
                await populate_workspace(db, oauth, project)
        out_dir = ensure_index_dir(project_id)
        prior_sha = project.indexed_commit_sha
        if settings.context_engine_enabled and prior_sha:
            from gigsnano_api.context_engine.index import index_incremental
            from gigsnano_api.workspace.code_artifacts import hydrate_graph_scratch

            # A wiped replica has no scratch graph to merge deltas into; restore it
            # from durable storage so incremental doesn't degrade to a full rebuild.
            await hydrate_graph_scratch(db, project_id, out_dir)
            did = await asyncio.to_thread(
                index_incremental, repo_dir, out_dir, project_id, prior_sha
            )
            if not did:
                await asyncio.to_thread(build_code_index, repo_dir, out_dir, project_id)
        else:
            await asyncio.to_thread(build_code_index, repo_dir, out_dir, project_id)
        from gigsnano_api.models.code_artifacts import ECodeArtifactKind
        from gigsnano_api.workspace.code_artifacts import persist_index_artifacts, save_artifact
        from gigsnano_api.workspace.er_extract import build_er_schema
        from gigsnano_api.workspace.metrics import build_metrics

        await asyncio.to_thread(build_er_schema, repo_dir, out_dir)
        await asyncio.to_thread(build_metrics, repo_dir, out_dir)
        sha = await asyncio.to_thread(head_commit_sha, repo_dir)
        # A repo-backed project must not reach READY without a commit we can name
        # (GIN-363). head_commit_sha returns None when the workspace isn't a live
        # git clone — e.g. a wiped/mounted replica the re-clone self-heal above
        # didn't cover. Flipping READY anyway left `indexed_commit_sha` NULL, which
        # the UI showed as "Indexed unknown" and downstream agents trusted as a
        # ready state we couldn't substantiate. Fail loudly and keep the prior
        # state for a retry instead of advertising an index we can't identify.
        if project.repo_full_name and not sha:
            detail = await asyncio.to_thread(head_read_error, repo_dir)
            raise RuntimeError(
                "indexing finished but the repository HEAD could not be read "
                f"(clone may be incomplete): {detail}; re-index to retry"
            )
        # Move the freshly-built scratch into durable storage before flipping READY,
        # so READY never advertises artifacts a reader can't find on this replica.
        await persist_index_artifacts(db, project_id, out_dir, sha)
        commits = await asyncio.to_thread(recent_commits, repo_dir)
        await save_artifact(db, project_id, ECodeArtifactKind.CHANGES, {"commits": commits}, sha)
        project.index_status = EIndexStatus.READY
        project.indexed_commit_sha = sha
        project.indexed_at = utcnow()
        # A success clears any prior failure. It's already cleared at start, but
        # setting it here makes the terminal state self-contained — the READY,
        # sha, timestamp and cleared error all land in the one final commit.
        project.index_error = None
        logger.info(
            "index_repo done project=%s repo=%s sha=%s status=ready indexed_at=%s",
            project_id, project.repo_full_name, sha, project.indexed_at.isoformat(),
        )
    except Exception as err:  # noqa: BLE001 - never raise out of a background job
        logger.exception("index_repo failed for project %s", project_id)
        raw = str(err)
        try:
            raw = raw.replace(str(workspace_root(project_id)), "<workspace>")
        except Exception as scrub_err:  # noqa: BLE001
            logger.debug("could not scrub workspace path from error: %s", scrub_err)
        raw = raw.replace(
            str(Path(settings.workspace_base_path).expanduser().resolve()), "<workspaces>"
        )
        project.index_status = EIndexStatus.FAILED
        project.index_error = _redact(raw, "")[:500] or type(err).__name__
    try:
        await db.commit()
    except Exception:  # noqa: BLE001 - last-write best effort
        logger.exception("index_repo final commit failed for project %s", project_id)


async def reap_interrupted_indexes(db: AsyncSession) -> int:
    """Mark every still-running index as failed. Call once at startup.

    An index runs as a BackgroundTask, so it cannot outlive the process: any row
    still PENDING/INDEXING at boot belongs to a run that died with the previous
    process (deploy, restart, crash) and has no writer left to ever resolve it.
    Nothing reconciled that, so the row sat at INDEXING forever — the frontend
    read it as "an index is in flight", showed the blocking overlay on every load,
    and hid the Re-index button (it renders only for none/failed/ready), leaving no
    way out. Failing the row is honest — the run really did die — and restores the
    on-demand Re-index action.
    """
    rows = (
        await db.execute(
            select(Project).where(
                Project.index_status.in_([EIndexStatus.PENDING, EIndexStatus.INDEXING])
            )
        )
    ).scalars().all()
    for project in rows:
        project.index_status = EIndexStatus.FAILED
        project.index_error = "Indexing was interrupted by a server restart. Re-index to retry."
    if rows:
        await db.commit()
        logger.warning("reaped %d index run(s) interrupted by restart", len(rows))
    return len(rows)


async def run_index_in_fresh_session(project_id: str) -> None:
    # The user-triggered index/re-index path: re-sync the working tree from GitHub
    # (self-healing an empty/wiped folder) before rebuilding. The auto-index that
    # runs right after a fresh clone calls index_repo() directly (resync defaults
    # off), so it never double-clones.
    from gigsnano_api.sync.github_oauth import build_oauth

    oauth = build_oauth()
    async with async_session() as db:
        await index_repo(db, project_id, resync=True, oauth=oauth)
