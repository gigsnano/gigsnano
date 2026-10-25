"""Restartable, idempotent project solution metadata backfill (GIN-445).

Rules (expand/contract rollout):
- null ``solution_key`` → ``software_delivery``
- null ``solution_version`` → ``1`` only when the effective key is
  ``software_delivery``
- never overwrite a non-null key or version
- collect invalid combinations for operator review (IDs + reasons only)
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.solutions.definitions import (
    BUILTIN_DEFINITIONS,
    SOFTWARE_DELIVERY_KEY,
    SOFTWARE_DELIVERY_VERSION,
)
from gigsnano_api.models import Project

_KNOWN_VERSIONS: dict[str, int] = {d.key: d.version for d in BUILTIN_DEFINITIONS}


@dataclass(frozen=True)
class InvalidCombination:
    """A row the backfill cannot safely repair — operator review only."""

    workspace_id: str
    project_id: str
    solution_key: str | None
    solution_version: int | None
    reason: str


@dataclass
class BackfillReport:
    """Aggregate outcome of one backfill run (no tenant payload / PII)."""

    scanned: int = 0
    updated: int = 0
    updated_by_workspace: dict[str, int] = field(default_factory=dict)
    invalid: list[InvalidCombination] = field(default_factory=list)

    def render(self) -> str:
        lines = [
            f"scanned={self.scanned} updated={self.updated} invalid={len(self.invalid)}"
        ]
        for workspace_id, count in sorted(self.updated_by_workspace.items()):
            lines.append(f"  workspace {workspace_id}: updated={count}")
        invalid_by_ws = Counter(row.workspace_id for row in self.invalid)
        for workspace_id, count in sorted(invalid_by_ws.items()):
            lines.append(f"  workspace {workspace_id}: invalid={count}")
        return "\n".join(lines)


def _needs_update(project: Project) -> bool:
    if project.solution_key is None:
        return True
    if (
        project.solution_version is None
        and project.solution_key == SOFTWARE_DELIVERY_KEY
    ):
        return True
    return False


def _classify_invalid(project: Project) -> InvalidCombination | None:
    key = project.solution_key
    version = project.solution_version
    if key is None:
        # Still pending backfill — not an invalid combination yet.
        return None
    if key not in _KNOWN_VERSIONS:
        return InvalidCombination(
            workspace_id=project.workspace_id,
            project_id=project.id,
            solution_key=key,
            solution_version=version,
            reason="unknown_solution_key",
        )
    if version is None:
        if key != SOFTWARE_DELIVERY_KEY:
            return InvalidCombination(
                workspace_id=project.workspace_id,
                project_id=project.id,
                solution_key=key,
                solution_version=version,
                reason="null_version_non_software_delivery",
            )
        return None
    expected = _KNOWN_VERSIONS[key]
    if version != expected:
        return InvalidCombination(
            workspace_id=project.workspace_id,
            project_id=project.id,
            solution_key=key,
            solution_version=version,
            reason=f"version_mismatch_expected_{expected}",
        )
    return None


def _apply_defaults(project: Project) -> bool:
    """Mutate null fields per rules. Returns True when any field changed."""
    changed = False
    if project.solution_key is None:
        project.solution_key = SOFTWARE_DELIVERY_KEY
        changed = True
    if (
        project.solution_version is None
        and project.solution_key == SOFTWARE_DELIVERY_KEY
    ):
        project.solution_version = SOFTWARE_DELIVERY_VERSION
        changed = True
    return changed


async def backfill_project_solutions(
    session: AsyncSession, *, batch_size: int = 500
) -> BackfillReport:
    """Fill null Software Delivery metadata in bounded, restartable batches.

    Session is injected — tests pass ``db_session``; the CLI opens one via
    ``core.db.async_session_scope``.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")

    report = BackfillReport()
    # Candidates: null key, or SD key with null version. Other null-version
    # rows are not writable and surface under ``invalid``.
    needs_work = or_(
        Project.solution_key.is_(None),
        and_(
            Project.solution_key == SOFTWARE_DELIVERY_KEY,
            Project.solution_version.is_(None),
        ),
    )

    while True:
        result = await session.execute(
            select(Project).where(needs_work).limit(batch_size)
        )
        batch = list(result.scalars().all())
        if not batch:
            break

        batch_updated = 0
        for project in batch:
            report.scanned += 1
            if not _needs_update(project):
                continue
            if _apply_defaults(project):
                batch_updated += 1
                report.updated += 1
                report.updated_by_workspace[project.workspace_id] = (
                    report.updated_by_workspace.get(project.workspace_id, 0) + 1
                )

        if batch_updated == 0:
            break
        await session.commit()

    # Second pass: collect invalid combinations across all projects (IDs only).
    # Restartable runs re-report the same set — no writes.
    all_rows = (await session.execute(select(Project))).scalars().all()
    seen: set[str] = set()
    for project in all_rows:
        invalid = _classify_invalid(project)
        if invalid is not None and invalid.project_id not in seen:
            seen.add(invalid.project_id)
            report.invalid.append(invalid)

    return report
