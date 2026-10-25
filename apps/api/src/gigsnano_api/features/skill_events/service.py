"""Skill delivery telemetry service (GIN-289): append-only event ingestion
(idempotent), state queries, completion-gate evaluation, audit reconstruction,
and event-derived metrics. Tenant scope flows through run -> story -> project."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.agent_runs import AgentRun
from gigsnano_api.models.projects import Project
from gigsnano_api.models.skill_events import ESkillEventState, SkillEvent
from gigsnano_api.models.stories import Story

_DELIVERY = {  # states that are "delivery", not "invocation" (kept for clarity)
    ESkillEventState.MATERIALIZED,
    ESkillEventState.AGENT_ACKNOWLEDGED,
}
_TERMINAL_BAD = {ESkillEventState.FAILED, ESkillEventState.REVOKED}


async def record_event(
    db: AsyncSession, run_id: str, *, skill_id: str, state: ESkillEventState,
    dedupe_key: str, version=None, digest=None, agent=None, gate=None,
    evidence=None, reason=None,
) -> SkillEvent:
    existing = (
        await db.execute(
            select(SkillEvent).where(
                SkillEvent.run_id == run_id, SkillEvent.dedupe_key == dedupe_key
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing  # idempotent
    ev = SkillEvent(
        run_id=run_id, skill_id=skill_id, state=state, dedupe_key=dedupe_key,
        version=version, digest=digest, agent=agent, gate=gate,
        evidence=evidence or [], reason=reason,
    )
    db.add(ev)
    try:
        await db.flush()
    except IntegrityError:  # concurrent duplicate on (run_id, dedupe_key)
        await db.rollback()
        return (
            await db.execute(
                select(SkillEvent).where(
                    SkillEvent.run_id == run_id, SkillEvent.dedupe_key == dedupe_key
                )
            )
        ).scalar_one()
    return ev


async def list_events(db: AsyncSession, run_id: str) -> list[SkillEvent]:
    rows = await db.execute(
        select(SkillEvent)
        .where(SkillEvent.run_id == run_id)
        .order_by(SkillEvent.created_at, SkillEvent.id)  # id tiebreak: stable order on equal timestamps
    )
    return list(rows.scalars().all())


async def current_states(db: AsyncSession, run_id: str) -> dict[str, str]:
    # Latest event per skill_id wins (events are ordered by created_at).
    latest: dict[str, str] = {}
    for ev in await list_events(db, run_id):
        latest[ev.skill_id] = ev.state.value
    return latest


async def evaluate_gate(
    db: AsyncSession, run_id: str, required_skill_ids: list[str], gates: list[str]
) -> dict:
    events = await list_events(db, run_id)
    verified: set[str] = set()
    latest_state: dict[str, ESkillEventState] = {}
    for ev in events:
        latest_state[ev.skill_id] = ev.state
        if ev.state == ESkillEventState.GATE_VERIFIED and ev.evidence:
            verified.add(ev.skill_id)
    missing = [
        s for s in required_skill_ids
        if s not in verified or latest_state.get(s) in _TERMINAL_BAD
    ]
    return {"passed": not missing, "missing": missing}


async def audit(db: AsyncSession, run_id: str) -> dict:
    events = await list_events(db, run_id)
    skills: dict[str, dict] = {}
    for ev in events:
        s = skills.setdefault(ev.skill_id, {"skill_id": ev.skill_id, "version": None,
                                            "digest": None, "states": []})
        s["states"].append(ev.state.value)
        # Pin version+digest together from the latest event that carries a digest,
        # so the reconstructed bundle is always a consistent (version, digest) pair.
        if ev.digest:
            s["version"] = ev.version
            s["digest"] = ev.digest
    return {
        "run_id": run_id,
        "skills": list(skills.values()),
        "events": [
            {"skill_id": e.skill_id, "state": e.state.value, "version": e.version,
             "digest": e.digest, "agent": e.agent, "gate": e.gate,
             "evidence": e.evidence, "reason": e.reason}
            for e in events
        ],
    }


async def metrics(db: AsyncSession, workspace_id: str) -> dict:
    rows = await db.execute(
        select(SkillEvent.state)
        .join(AgentRun, AgentRun.id == SkillEvent.run_id)
        .join(Story, Story.id == AgentRun.story_id)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == workspace_id)
    )
    by_state: dict[str, int] = {}
    for (state,) in rows.all():
        by_state[state.value] = by_state.get(state.value, 0) + 1
    return {
        "by_state": by_state,
        "skill_success": by_state.get("gate_verified", 0),
        "skill_failure": by_state.get("failed", 0),
        "gate_verified": by_state.get("gate_verified", 0),
        "gate_failed": by_state.get("failed", 0),
    }
