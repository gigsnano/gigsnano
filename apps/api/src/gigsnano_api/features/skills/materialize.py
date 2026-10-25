"""Materialize pinned skill bundles into per-agent directories (GIN-285).

Reads bundles in-process from the GIN-284 registry, verifies each against its
recorded digest, and writes the canonical content into exactly one directory per
agent. Tracks what it wrote in an ephemeral per-run manifest so cleanup removes
only materialized files, never a committed project-owned skill."""

import json
import os
import re
import shutil
import stat
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.skills import bundle, service
from gigsnano_api.models import Project
from gigsnano_api.workspace.paths import workspace_root

# One canonical directory per agent. Codex and Cursor share .agents/skills, so a
# skill is written exactly once for Cursor (no duplicate compatible dirs).
_AGENT_DIRS = {
    "claude-code": ".claude/skills",
    "codex": ".agents/skills",
    "cursor": ".agents/skills",
}
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")
_MANIFEST_DIR = ".gigsnano/materialized"


class DigestMismatch(Exception):
    """A bundle's content does not match its recorded digest."""


class IncompatibleAgent(Exception):
    """A skill declares agent compatibility that excludes the target agent."""


class SkillConflict(Exception):
    """A project-owned skill already occupies the target path."""


@dataclass
class MaterializedSkill:
    name: str
    version: str
    digest: str
    path: str  # POSIX, relative to the project workspace root


@dataclass
class LaunchContract:
    agent: str
    run_id: str
    skills: list[MaterializedSkill]
    activated: list[str]


def _manifest_path(root: Path, run_id: str) -> Path:
    if not _SAFE_NAME.match(run_id):
        raise ValueError(f"Illegal run id: {run_id!r}")
    return root / _MANIFEST_DIR / f"{run_id}.json"


def _read_manifest(root: Path, run_id: str) -> list[str]:
    p = _manifest_path(root, run_id)
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def _on_rm_error(func, path, _exc):
    # git-sourced files can be read-only on Windows (WinError 5): clear + retry.
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError:
        pass


def _remove_paths(root: Path, rel_paths: list[str]) -> None:
    for rel in rel_paths:
        target = (root / rel).resolve()
        target.relative_to(root)  # containment; raises ValueError if escaped
        if target.is_dir():
            shutil.rmtree(target, onexc=_on_rm_error)
        elif target.exists():
            target.unlink()


async def materialize(
    db: AsyncSession, project_id: str, agent: str, version_ids: list[str], run_id: str
) -> LaunchContract:
    if agent not in _AGENT_DIRS:
        raise ValueError(f"Unknown agent: {agent!r}")
    project = await db.get(Project, project_id)
    if project is None:
        raise LookupError(f"project {project_id} not found")
    root = workspace_root(project_id)
    root.mkdir(parents=True, exist_ok=True)
    agent_dir = _AGENT_DIRS[agent]
    owned = set(_read_manifest(root, run_id))  # paths this run previously wrote

    # Pass 1: validate every version, write nothing.
    planned: list[tuple] = []
    for vid in version_ids:
        ver = await service.get_version(db, project.workspace_id, vid)  # LookupError: missing OR cross-tenant
        if ver.lifecycle == "revoked":
            raise service.SkillRevoked(vid)
        pkg = await service.get_package(db, project.workspace_id, ver.package_id)  # LookupError cross-tenant
        files = bundle.read_tgz(ver.data)
        if bundle.content_digest(files) != ver.digest:
            raise DigestMismatch(f"{pkg.name}: bundle digest != recorded {ver.digest}")
        if not _SAFE_NAME.match(pkg.name):
            raise ValueError(f"Illegal skill name: {pkg.name!r}")
        compat = ver.manifest.get("agents") or ver.manifest.get("compatibility")
        if isinstance(compat, str):
            compat = [compat]
        if isinstance(compat, list) and compat and agent not in compat:
            raise IncompatibleAgent(f"{pkg.name} not compatible with {agent} (declares {compat})")
        rel = f"{agent_dir}/{pkg.name}"
        target = (root / rel).resolve()
        target.relative_to(root)  # containment
        if target.exists() and rel not in owned:
            raise SkillConflict(f"{pkg.name}: a project-owned skill already exists at {rel}")
        for relpath in files:
            dest = (target / relpath).resolve()
            try:
                dest.relative_to(target)
            except ValueError:
                raise ValueError(f"{pkg.name}: bundle path escapes skill dir: {relpath!r}")
        planned.append((pkg.name, ver, files, target, rel))

    # Reset this run's own prior output (idempotent re-run), then write.
    _remove_paths(root, sorted(owned))
    written_rel: list[str] = []
    skills: list[MaterializedSkill] = []
    for name, ver, files, target, rel in planned:
        for relpath, text in files.items():
            dest = target / relpath
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text, encoding="utf-8")
        written_rel.append(rel)
        skills.append(MaterializedSkill(name=name, version=ver.version, digest=ver.digest, path=rel))

    mpath = _manifest_path(root, run_id)
    mpath.parent.mkdir(parents=True, exist_ok=True)
    mpath.write_text(json.dumps(written_rel), encoding="utf-8")

    return LaunchContract(
        agent=agent, run_id=run_id, skills=skills, activated=[s.name for s in skills]
    )


def cleanup(project_id: str, run_id: str) -> None:
    """Remove only the paths this run materialized, then the run manifest.
    Anything not listed in the manifest (committed skills, cloned repo) is left
    untouched. Idempotent: a missing manifest is a no-op."""
    root = workspace_root(project_id)
    mpath = _manifest_path(root, run_id)
    if not mpath.exists():
        return
    _remove_paths(root, _read_manifest(root, run_id))
    mpath.unlink()
