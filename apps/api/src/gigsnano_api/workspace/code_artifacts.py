"""Read/write seam for durable code-intelligence artifacts (see
`models/code_artifacts.py`). The index build writes JSON into the index dir as
scratch; `persist_index_artifacts` moves it into Postgres, and every
request-serving reader loads it back through `load_artifact`.

Upsert is a manual select-then-write rather than a Postgres `ON CONFLICT`, so the
same code path works under the SQLite test DB. Safe because exactly one index runs
per project at a time (a BackgroundTask; interrupted runs are reaped at startup),
so there's no concurrent writer to race on the (project, kind) unique key.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import utcnow
from gigsnano_api.models.code_artifacts import CodeArtifact, ECodeArtifactKind

# The file-backed artifact kinds and their scratch filenames. `changes` is not a
# build file — it's computed straight from git in index_repo and saved directly.
ARTIFACT_FILES: dict[ECodeArtifactKind, str] = {
    ECodeArtifactKind.GRAPH: "graph.json",
    ECodeArtifactKind.METRICS: "metrics.json",
    ECodeArtifactKind.ER: "er.json",
    ECodeArtifactKind.ISSUES: "issues.json",
}


async def load_artifact(
    db: AsyncSession, project_id: str, kind: ECodeArtifactKind
) -> CodeArtifact | None:
    return (
        await db.execute(
            select(CodeArtifact).where(
                CodeArtifact.project_id == project_id, CodeArtifact.kind == kind
            )
        )
    ).scalar_one_or_none()


async def load_artifacts(
    db: AsyncSession, project_id: str
) -> dict[ECodeArtifactKind, CodeArtifact]:
    """Every artifact for a project in one query — the overview endpoint's fan-in."""
    rows = (
        await db.execute(select(CodeArtifact).where(CodeArtifact.project_id == project_id))
    ).scalars().all()
    return {row.kind: row for row in rows}


async def save_artifact(
    db: AsyncSession,
    project_id: str,
    kind: ECodeArtifactKind,
    data: dict,
    commit_sha: str | None,
) -> None:
    """Upsert one artifact. Caller commits."""
    row = await load_artifact(db, project_id, kind)
    if row is None:
        db.add(
            CodeArtifact(
                project_id=project_id,
                kind=kind,
                data=data,
                commit_sha=commit_sha,
                built_at=utcnow(),
            )
        )
    else:
        row.data = data
        row.commit_sha = commit_sha
        row.built_at = utcnow()


async def persist_index_artifacts(
    db: AsyncSession, project_id: str, out_dir: Path, commit_sha: str | None
) -> None:
    """Persist the JSON files a fresh index wrote into out_dir. A missing file is
    skipped — for `issues.json` that's the honest "semgrep didn't scan" signal, so
    we never overwrite/fabricate a scan result that didn't happen."""
    for kind, fname in ARTIFACT_FILES.items():
        path = out_dir / fname
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        await save_artifact(db, project_id, kind, data, commit_sha)


async def hydrate_graph_scratch(db: AsyncSession, project_id: str, out_dir: Path) -> None:
    """Write the persisted graph back to the scratch dir when it's missing there —
    lets incremental indexing keep working on a fresh replica whose disk was wiped,
    instead of silently falling back to a full rebuild every redeploy."""
    graph_path = out_dir / "graph.json"
    if graph_path.is_file():
        return
    row = await load_artifact(db, project_id, ECodeArtifactKind.GRAPH)
    if row is not None:
        graph_path.write_text(json.dumps(row.data), encoding="utf-8")
