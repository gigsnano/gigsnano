"""Brownfield clone into the project workspace (spec §6.5). Real path shells
out to `git clone` with an installation token; keyless dev simulates it. Never
raises — failures land on Project.clone_status/clone_error so creation survives."""

import asyncio
import logging
import os
import re
import shutil
import stat
import subprocess
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import async_session
from gigsnano_api.models import ECloneStatus, GitHubConnection, Project
from gigsnano_api.sync.github_oauth import FakeGitHubOAuth, GitHubOAuth, decrypt_token
from gigsnano_api.workspace.paths import ensure_workspace

_CLONE_TIMEOUT_SECONDS = 120

_USERINFO_RE = re.compile(r"x-access-token:[^@]*@")

logger = logging.getLogger("gigsnano.clone")


def _on_rm_error(func, path, _exc):
    """rmtree/unlink handler: git pack files are read-only on Windows, which
    blocks deletion (WinError 5). Clear the flag and retry."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError:
        pass


def _clear_dir_contents(root: Path) -> None:
    """Empty a directory's contents (handling read-only .git files), leaving the
    dir itself in place (it may be a mount point)."""
    for entry in root.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry, onexc=_on_rm_error)
        else:
            try:
                entry.unlink()
            except PermissionError:
                os.chmod(entry, stat.S_IWRITE)
                entry.unlink()


def _redact(text: str, token: str) -> str:
    """Strip a known token (and any x-access-token userinfo) out of `text`."""
    redacted = text
    if token:
        redacted = redacted.replace(token, "***")
    return _USERINFO_RE.sub("x-access-token:***@", redacted)


def _failure_message(err: BaseException, token: str = "") -> str:  # nosec B107 - empty default, the caller passes the real token to redact
    """A never-empty, token-redacted string for Project.clone_error. Some
    exceptions stringify to '' — which surfaced in the UI as "cloning failed"
    with no reason (GIN-12) — so fall back to the exception type name."""
    message = str(err).strip() or type(err).__name__
    if token:
        message = _redact(message, token)
        message = _redact(message, quote(token, safe=""))
    return message[:1000]


async def _git_clone(remote_url: str, branch: str, dest: Path, token: str = "") -> None:
    """Shell out to `git clone` off the event loop.

    Uses `subprocess.run` via `asyncio.to_thread` instead of
    `asyncio.create_subprocess_exec`. On Windows, uvicorn `--reload` forces
    SelectorEventLoop, which raises a bare NotImplementedError for async
    subprocesses — that was surfacing in the UI as "Clone failed: NotImplementedError".
    """
    args = [
        "git",
        "clone",
        # Shallow but deep enough that the "Recent changes" panel has real history
        # (the index only needs the working tree; 50 commits keeps the clone small).
        "--depth",
        "50",
        "--single-branch",
        "--branch",
        branch,
        remote_url,
        str(dest),
    ]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    def _run() -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            args,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            env=env,
            timeout=_CLONE_TIMEOUT_SECONDS,
            check=False,
        )

    try:
        completed = await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired as err:
        raise RuntimeError("git clone timed out") from err
    if completed.returncode != 0:
        message = completed.stderr.decode("utf-8", "replace").strip() or "git clone failed"
        if token:
            message = _redact(message, token)
            message = _redact(message, quote(token, safe=""))
        raise RuntimeError(message)


def _force_rmtree(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, onexc=_on_rm_error)


async def _clone_and_swap(remote: str, branch: str, final: Path, token: str = "") -> None:
    """Clone into a fresh sibling dir, then swap it into place (GIN-371).

    `git clone` refuses a non-empty target, and a re-clone of a broken/headless
    workspace can't reliably empty it in place — git makes pack files read-only and
    the workspace mount (Azure Files) may not honour a chmod, so `_clear_dir_contents`
    leaves a stub `.git` behind and the clone fails "destination already exists".
    Cloning into an empty temp dir always succeeds; promoting it is a rename, which
    only needs write on the parent and never has to delete the stubborn old tree."""
    parent = final.parent
    tmp = parent / f"{final.name}.reclone"
    stale = parent / f"{final.name}.stale"
    _force_rmtree(tmp)
    _force_rmtree(stale)

    await _git_clone(remote, branch, tmp, token=token)
    try:
        if final.exists():
            final.rename(stale)  # move the old (possibly headless/read-only) tree aside
        tmp.rename(final)  # promote the fresh clone
    except OSError:
        # `final` couldn't be renamed (e.g. it is itself a mount point): fall back to
        # clearing it in place and moving the fresh contents up.
        if stale.exists() and not final.exists():
            stale.rename(final)
        _clear_dir_contents(final)
        for entry in list(tmp.iterdir()):
            shutil.move(str(entry), str(final / entry.name))
        _force_rmtree(tmp)
    _force_rmtree(stale)


async def _safe_rollback(db: AsyncSession) -> None:
    try:
        await db.rollback()
    except Exception as err:  # noqa: BLE001 — best-effort cleanup only
        logger.debug("rollback during cleanup failed: %s", err)


async def populate_workspace(db: AsyncSession, oauth: GitHubOAuth, project: Project) -> None:
    """Clear the project's workspace dir and (re-)clone its repo into it. Raises a
    RuntimeError with a redacted message on failure. Owns NO DB status writes — the
    caller drives the clone_status/index_status lifecycle. Reused by both the clone
    flow and the index flow (re-index self-heals a persistent-but-empty folder)."""
    token = ""  # nosec B105 - empty placeholder, filled below when a token exists
    try:
        root = ensure_workspace(project.id)
        branch = project.repo_default_branch or "main"
        if isinstance(oauth, FakeGitHubOAuth):
            # keyless dev: simulate a clone so the flow is testable with no creds
            _clear_dir_contents(root)
            (root / "README.md").write_text(
                f"# {project.repo_full_name}\n\n(simulated clone)\n", encoding="utf-8"
            )
            return
        connection = (
            await db.execute(
                select(GitHubConnection).where(
                    GitHubConnection.workspace_id == project.workspace_id
                )
            )
        ).scalar_one_or_none()
        if connection is None or not connection.access_token_encrypted:
            raise RuntimeError("Workspace GitHub connection missing")
        token = decrypt_token(connection.access_token_encrypted)
        safe = quote(token, safe="")
        remote = f"https://x-access-token:{safe}@github.com/{project.repo_full_name}.git"
        # Clone into a temp sibling then swap into place: works whether the workspace
        # is empty (first clone) or a broken/read-only tree (re-clone), without git's
        # "destination not empty" failure and without deleting stubborn pack files
        # (GIN-371). The temp is a sibling under the same base, so the swap is a
        # same-filesystem rename (no cross-drive copy).
        await _clone_and_swap(remote, branch, root, token=token)
    except Exception as err:  # redact the token out of any error before it propagates
        raise RuntimeError(_failure_message(err, token)) from err


async def clone_repo(db: AsyncSession, oauth: GitHubOAuth, project_id: str) -> None:
    # Fetching the project + flipping it to CLONING must never propagate: if the
    # DB is unreachable here there is nothing further we can safely do.
    try:
        project = await db.get(Project, project_id)
        if project is None or not project.repo_full_name:
            return
        project.clone_status = ECloneStatus.CLONING
        project.clone_error = None
        await db.commit()
    except Exception:  # noqa: BLE001 — nothing to record the failure against
        await _safe_rollback(db)
        return

    try:
        await populate_workspace(db, oauth, project)
        project.clone_status = ECloneStatus.READY
        project.clone_error = None
    except Exception as err:  # noqa: BLE001 — status carries the failure
        # Log server-side so operators can diagnose (clone_error alone reaches the
        # UI but not the logs); the message (already redacted) carries into clone_error.
        logger.exception(
            "clone failed for project %s (repo %s)", project_id, project.repo_full_name
        )
        project.clone_status = ECloneStatus.FAILED
        project.clone_error = str(err)[:500] or type(err).__name__

    # Best-effort: a failure to persist the final status must not raise either.
    try:
        await db.commit()
    except Exception:  # noqa: BLE001 — best-effort persistence only
        await _safe_rollback(db)
        return

    # Auto-index the freshly cloned repo (best-effort; never fail the clone on
    # it). Placed AFTER the READY commit so a failed index never rolls back a
    # successful clone.
    if project.clone_status == ECloneStatus.READY:
        try:
            from gigsnano_api.workspace.code_index import index_repo

            await index_repo(db, project.id)
        except Exception:  # noqa: BLE001
            logger.exception("auto-index after clone failed for project %s", project.id)


async def run_clone_in_fresh_session(oauth: GitHubOAuth, project_id: str) -> None:
    async with async_session() as db:
        await clone_repo(db, oauth, project_id)
