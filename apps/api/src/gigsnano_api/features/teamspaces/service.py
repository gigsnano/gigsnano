"""Teamspace membership sync + cross-project rollup/workload (GIN-245). Rollup
copies the roadmap count pattern over the team's projects (gated by the caller's
accessible projects); workload = human assignee counts + agent-persona load."""

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.stories import EStoryStatus, Story
from gigsnano_api.models.teamspaces import TeamspaceMember, TeamspaceProject

_DONE = EStoryStatus.DONE


async def member_ids(db: AsyncSession, teamspace_id: str) -> list[str]:
    rows = await db.execute(
        select(TeamspaceMember.user_id).where(TeamspaceMember.teamspace_id == teamspace_id)
    )
    return [r[0] for r in rows.all()]


async def project_ids(db: AsyncSession, teamspace_id: str) -> list[str]:
    rows = await db.execute(
        select(TeamspaceProject.project_id).where(TeamspaceProject.teamspace_id == teamspace_id)
    )
    return [r[0] for r in rows.all()]


async def set_members(db: AsyncSession, teamspace_id: str, user_ids: list[str]) -> None:
    await db.execute(delete(TeamspaceMember).where(TeamspaceMember.teamspace_id == teamspace_id))
    for uid in dict.fromkeys(user_ids):  # dedup, keep order
        db.add(TeamspaceMember(teamspace_id=teamspace_id, user_id=uid))
    await db.flush()


async def set_projects(db: AsyncSession, teamspace_id: str, pids: list[str]) -> None:
    await db.execute(delete(TeamspaceProject).where(TeamspaceProject.teamspace_id == teamspace_id))
    for pid in dict.fromkeys(pids):
        db.add(TeamspaceProject(teamspace_id=teamspace_id, project_id=pid))
    await db.flush()


def _visible(pids: list[str], accessible_ids: list[str] | None) -> list[str]:
    if accessible_ids is None:
        return pids
    allowed = set(accessible_ids)
    return [p for p in pids if p in allowed]


async def rollup(db: AsyncSession, pids: list[str]) -> dict:
    if not pids:
        return {"total": 0, "done": 0, "progress_pct": 0}
    row = (
        await db.execute(
            select(
                func.count(),
                func.sum(case((Story.status == _DONE, 1), else_=0)),
            ).where(Story.project_id.in_(pids))
        )
    ).one()
    total, done = int(row[0] or 0), int(row[1] or 0)
    return {"total": total, "done": done,
            "progress_pct": round(done / total * 100) if total else 0}


async def human_workload(db: AsyncSession, pids: list[str]) -> dict[str, int]:
    """Open (non-done) work item counts per assignee across the team's projects."""
    if not pids:
        return {}
    rows = await db.execute(
        select(Story.assignee_id, func.count())
        .where(Story.project_id.in_(pids), Story.status != _DONE)
        .group_by(Story.assignee_id)
    )
    return {(a or "unassigned"): int(n) for a, n in rows.all()}
