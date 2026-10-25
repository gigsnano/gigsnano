"""Agent launcher — the control-plane wrapper around remote agent delegation
(GIN-342). Uses the STORED (reviewed/overridden) Execution Profile: refuses to
start a stale or skill-missing run, builds the active-skill prompt a remote agent
receives via the delegation's `custom_prompt`, creates a run for telemetry, and
exposes an advisory completion gate. It does NOT execute the agent — that is
agent_delegation's job; this is the control-plane it wraps."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.execution_profiles import service as ep
from gigsnano_api.features.skill_events import service as se
from gigsnano_api.features.skills import bundle
from gigsnano_api.features.skills import service as registry
from gigsnano_api.models.agent_runs import AgentRun, EAgentRunState
from gigsnano_api.models.skill_events import ESkillEventState

# Labels the telemetry run; not load-bearing.
_PERSONA_BY_TYPE = {
    "design": "agent_ux",
    "docs": "agent_analyst",
    "architecture": "agent_architect",
    "bug": "agent_dev",
    "test": "agent_qa",
    "feature": "agent_dev",
}


@dataclass
class LaunchPlan:
    run_id: str            # the AgentRun created for telemetry
    agent: str             # the stored profile's target agent
    skill_prompt: str      # active-skill preamble → the delegation's custom_prompt
    profile: dict          # the effective profile (overrides applied)
    required: list[str]    # required pinned skill names (for the gate)


class LaunchBlocked(Exception):
    """A run cannot start — no profile, a stale profile, or a missing required skill."""


def _text(story) -> str:
    return f"{story.title}\n{story.description or ''}"


async def _skill_md(db: AsyncSession, workspace_id: str, name: str, version: str) -> str | None:
    packages = {p.name: p for p in await registry.list_visible(db, workspace_id)}
    pkg = packages.get(name)
    if pkg is None:
        return None
    for v in await registry.versions_for(db, pkg.id):
        if v.version == version:
            return bundle.read_tgz(v.data).get("SKILL.md")
    return None


async def _build_skill_prompt(db: AsyncSession, workspace_id: str, skills: list[dict]) -> str:
    lines = [
        "# Active skills for this run",
        "The following skills are pinned for this work item. Follow them.",
        "",
    ]
    for s in skills:
        if s["status"] != "pinned" or s["mode"] == "prohibited":
            continue
        md = await _skill_md(db, workspace_id, s["skillId"], s["version"])
        if md is None:
            continue
        lines.append(f"## {s['skillId']} (v{s['version']}, {s['mode']})")
        lines.append(md.strip())
        lines.append("")
    return "\n".join(lines).strip()


async def prepare_launch(db: AsyncSession, story, workspace_id: str) -> LaunchPlan:
    """Control-plane preflight for launching a work item to its agent. Reads the
    STORED profile (never silently re-resolves) and refuses to start on a stale
    profile or a missing required skill — the 'can't start silently' guarantee."""
    row = await ep.get_stored(db, story.id)
    if row is None:
        raise LaunchBlocked("no execution profile — resolve one first")
    if await ep.is_stale(db, row, workspace_id, _text(story)):
        raise LaunchBlocked("execution profile is stale — re-resolve before launching")

    profile = ep.to_dict(row, stale=False)["profile"]  # effective (overrides applied)
    required = [s for s in profile["skills"] if s["mode"] == "required"]
    unavailable = [s["skillId"] for s in required if s["status"] != "pinned"]
    if unavailable:
        raise LaunchBlocked(f"required skills unavailable: {', '.join(unavailable)}")

    skill_prompt = await _build_skill_prompt(db, workspace_id, profile["skills"])

    work_type = profile["classification"]["work_type"]
    run = AgentRun(
        story_id=story.id,
        persona_id=_PERSONA_BY_TYPE.get(work_type, "agent_dev"),
        state=EAgentRunState.EXECUTING,
    )
    db.add(run)
    await db.flush()

    # Honest telemetry: RESOLVED (pinned + delivered in the prompt). Never
    # 'materialized'/'invoked' — no disk delivery, and the agent has not run yet.
    for s in profile["skills"]:
        if s["status"] == "pinned" and s["mode"] != "prohibited":
            await se.record_event(
                db, run.id, skill_id=s["skillId"], state=ESkillEventState.RESOLVED,
                dedupe_key=f"{s['skillId']}-resolved", version=s["version"], digest=s["digest"],
            )

    return LaunchPlan(
        run_id=run.id, agent=row.agent, skill_prompt=skill_prompt,
        profile=profile, required=[s["skillId"] for s in required],
    )


async def gate_status(db: AsyncSession, run_id: str, required: list[str]) -> dict:
    """Advisory completion gate: are the required skills verified with evidence?
    A future complete_work_item reads this before the review handoff so a
    gate-failing run is surfaced, not silently completed."""
    return await se.evaluate_gate(db, run_id, required, [])


async def _latest_run(db: AsyncSession, story_id: str) -> AgentRun | None:
    return (
        await db.execute(
            select(AgentRun).where(AgentRun.story_id == story_id)
            .order_by(AgentRun.created_at.desc()).limit(1)
        )
    ).scalars().first()


async def completion_gate(db: AsyncSession, story, workspace_id: str) -> dict:
    """Story-level advisory gate for the review handoff. Reads the stored profile's
    required+pinned skills and the latest run's telemetry, then evaluate_gate.
    NEVER raises and NEVER blocks — returns {passed, missing, run_id, reason} so a
    gate-failing run is surfaced, not silently completed. No profile / no run →
    passed (nothing to gate)."""
    row = await ep.get_stored(db, story.id)
    if row is None:
        return {"passed": True, "missing": [], "run_id": None, "reason": "no execution profile"}
    profile = ep.to_dict(row, stale=False)["profile"]
    required = [
        s["skillId"] for s in profile["skills"]
        if s["mode"] == "required" and s["status"] == "pinned"
    ]
    run = await _latest_run(db, story.id)
    if run is None:
        return {"passed": True, "missing": [], "run_id": None, "reason": "no run"}
    result = await se.evaluate_gate(db, run.id, required, [])
    return {**result, "run_id": run.id, "reason": None}
