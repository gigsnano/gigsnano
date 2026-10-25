"""Mirror a project's generated BMAD docs onto its physical workspace (spec
§6). Uses the same `materialize()` rendering as GitHub sync, so the on-disk
layout is byte-identical to what a repo sync would push. Best-effort: a
disk-mirror failure must never break a finalize — every error is swallowed."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Project
from gigsnano_api.workspace.paths import ensure_workspace


async def write_project_artifacts_to_disk(db: AsyncSession, project: Project) -> None:
    try:
        # Imported lazily to avoid any import cycle between sync/materializer
        # and workspace (materializer has no reason to import workspace today,
        # but this keeps the dependency direction one-way regardless).
        from gigsnano_api.sync.materializer import materialize

        files = await materialize(db, project)
        root = ensure_workspace(project.id).resolve()
        for rel_path, content in files.items():
            try:
                target = (root / rel_path).resolve()
                target.relative_to(root)  # re-verify containment per write
            except ValueError:
                continue  # path escapes the workspace root — skip, don't raise
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
    except Exception:  # noqa: BLE001 — disk mirror is best-effort, never fatal
        logging.getLogger(__name__).warning("artifact disk mirror failed", exc_info=True)
