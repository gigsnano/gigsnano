"""Material-change health alerts (GIN-339, alerting half).

When a recalc records a new snapshot, compare it to the prior one and — only on a
*material* change (health degraded, forecast slipped past target, or confidence
collapsed) — notify the project's active members. Deduplication and throttling are
inherent: an unchanged forecast is never re-stored (so no snapshot, no alert), and
alerts fire only on the transition between two materially different snapshots.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.notifications.router import notify
from gigsnano_api.models import (
    EMemberStatus,
    ENotificationKind,
    ForecastSnapshot,
    Project,
    ProjectMember,
)

# How bad a health status is (higher = worse). Unknown/on_track carry no concern.
_CONCERN = {"on_track": 0, "no_data": 0, "at_risk": 1, "off_track": 2}
# Confidence ordering for "collapse" detection.
_CONF = {"no_data": 0, "low": 1, "medium": 2, "high": 3}
# Forecast-vs-target ordering ("on" best, "off" worst).
_FVT = {"on": 0, "at_risk": 1, "off": 2}

_REASON_TEXT = {
    "health_degraded": "Project health degraded",
    "forecast_slipped": "The forecast slipped further past the target date",
    "confidence_collapsed": "Forecast confidence dropped sharply",
}


def detect_material_change(prev: ForecastSnapshot, curr: ForecastSnapshot) -> list[str]:
    """Reason codes for a material worsening from `prev` to `curr` (empty = nothing
    alert-worthy). Only degradations alert — improvements are good news, not an alert.
    Pure: two snapshots in, reason codes out."""
    reasons: list[str] = []
    if _CONCERN.get(curr.health_status or "", 0) > _CONCERN.get(prev.health_status or "", 0):
        reasons.append("health_degraded")
    pv, cv = prev.forecast_vs_target, curr.forecast_vs_target
    if pv in _FVT and cv in _FVT and _FVT[cv] > _FVT[pv]:
        reasons.append("forecast_slipped")
    if _CONF.get(prev.confidence, 0) >= _CONF["medium"] and _CONF.get(curr.confidence, 0) <= _CONF["low"]:
        reasons.append("confidence_collapsed")
    return reasons


async def _active_member_ids(db: AsyncSession, project_id: str) -> list[str]:
    rows = await db.execute(
        select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    )
    return [r[0] for r in rows.all()]


async def emit_material_change_alerts(
    db: AsyncSession,
    project: Project,
    *,
    workspace_id: str,
    slug: str,
    triggered_by_id: str | None,
) -> list[str]:
    """If the two most recent snapshots differ materially, notify the project's active
    members (in-app, System kind), linking to the Project Health view. Returns the
    reason codes alerted on (empty if none). No commit — joins the caller's txn."""
    rows = list(
        (
            await db.execute(
                select(ForecastSnapshot)
                .where(ForecastSnapshot.project_id == project.id)
                .order_by(ForecastSnapshot.calculated_at.desc())
                .limit(2)
            )
        )
        .scalars()
        .all()
    )
    if len(rows) < 2:
        return []  # first snapshot — nothing to compare against
    curr, prev = rows[0], rows[1]
    reasons = detect_material_change(prev, curr)
    if not reasons:
        return []

    body = "; ".join(_REASON_TEXT.get(r, r) for r in reasons)
    href = f"/{slug}/projects/{project.id}"
    for uid in await _active_member_ids(db, project.id):
        await notify(
            db,
            workspace_id,
            receiver_id=uid,
            kind=ENotificationKind.SYSTEM,
            title=f"Health alert: {project.name}",
            body=body,
            href=href,
            triggered_by_id=triggered_by_id,
            project_id=project.id,
        )
    return reasons
