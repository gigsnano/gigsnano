"""Compatibility resolver (GIN-409).

The seam that lets legacy single-repository callers keep working while the code
migrates to explicit ``project_repository_id`` arguments. New code resolves the
Primary repository through here; until a caller is migrated it can still read the
legacy ``Project.repo_*`` columns, and ``record_legacy_repo_access`` marks those
sites so telemetry shows when the legacy fields can finally be dropped.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import ProjectRepository

logger = logging.getLogger("gigsnano.multi_repo")


async def get_primary_repository(
    session: AsyncSession, project_id: str
) -> ProjectRepository | None:
    """The project's active Primary repository, or None (project has none yet)."""
    result = await session.execute(
        select(ProjectRepository)
        .where(ProjectRepository.project_id == project_id)
        .where(ProjectRepository.is_primary.is_(True))
        .where(ProjectRepository.archived_at.is_(None))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_repository(session: AsyncSession, repo_id: str) -> ProjectRepository | None:
    """A specific connected repository by id (active or archived)."""
    return await session.get(ProjectRepository, repo_id)


async def list_repositories(
    session: AsyncSession, project_id: str, *, include_archived: bool = False
) -> list[ProjectRepository]:
    """All connected repositories for a project (active only unless asked)."""
    query = select(ProjectRepository).where(ProjectRepository.project_id == project_id)
    if not include_archived:
        query = query.where(ProjectRepository.archived_at.is_(None))
    result = await session.execute(query.order_by(ProjectRepository.created_at))
    return list(result.scalars().all())


def record_legacy_repo_access(project_id: str, caller: str) -> None:
    """Telemetry marker for a site still reading legacy ``Project.repo_*`` fields.

    Emitting a structured log keeps the drop-legacy-columns decision evidence-based
    (GIN-409 DoD: legacy fields stay until telemetry proves no caller relies on them).
    """
    logger.info("legacy_repo_access", extra={"project_id": project_id, "caller": caller})
