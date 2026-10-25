"""Dry-run classifier for the project-owner migration (GIN-318/319/322).

Reports how every project would be resolved by the lead→owner backfill WITHOUT
mutating anything, so ownerless/ambiguous projects get manual resolution rather
than a guessed owner. Safe to run against production before the real migration.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import EProjectRole, Project, ProjectMember


async def owner_migration_dry_run(db: AsyncSession) -> dict:
    """Classify every project for the migration. Returns counts + per-project detail:
    - resolved: lead becomes owner (upgrade an existing membership or insert one)
    - already_owner: lead is already the owner (idempotent no-op)
    - ownerless: no lead and no existing owner — needs manual assignment
    - duplicate_owner: more than one owner already (flag for review)
    """
    projects = list((await db.execute(select(Project))).scalars().all())
    resolved: list[dict] = []
    already_owner: list[str] = []
    ownerless: list[dict] = []
    duplicate_owner: list[str] = []

    for project in projects:
        members = list(
            (
                await db.execute(
                    select(ProjectMember).where(ProjectMember.project_id == project.id)
                )
            )
            .scalars()
            .all()
        )
        owners = [m for m in members if m.role == EProjectRole.OWNER]
        if len(owners) > 1:
            duplicate_owner.append(project.id)

        if project.lead_id is None:
            if not owners:
                ownerless.append({"project_id": project.id, "name": project.name})
            continue

        lead_member = next((m for m in members if m.user_id == project.lead_id), None)
        if lead_member is not None and lead_member.role == EProjectRole.OWNER:
            already_owner.append(project.id)
        else:
            resolved.append(
                {
                    "project_id": project.id,
                    "lead_id": project.lead_id,
                    "action": "upgrade" if lead_member is not None else "insert",
                }
            )

    return {
        "total_projects": len(projects),
        "resolved": resolved,
        "already_owner": already_owner,
        "ownerless": ownerless,
        "duplicate_owner": duplicate_owner,
    }
