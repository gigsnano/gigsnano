"""Execution Profile persistence + policy (GIN-287). Persist the resolver
snapshot, layer user overrides on top, detect staleness by re-resolving, and
reject overrides under a locked policy. Reassigns JSON fields (never mutates in
place) so SQLAlchemy tracks the change."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.task_router.resolver import resolve_execution_profile as _resolve
from gigsnano_api.models.execution_profiles import ExecutionProfile

_VALID_MODES = {"required", "recommended", "prohibited", "removed"}


class ProfileLocked(Exception):
    """A locked-policy profile cannot be overridden."""


def effective(snapshot: dict, overrides: dict) -> dict:
    """The base resolver snapshot with user overrides applied."""
    by_id = {s["skillId"]: dict(s) for s in snapshot.get("skills", [])}
    for sid, ov in overrides.items():
        mode = ov["mode"]
        if mode == "removed":
            by_id.pop(sid, None)
        elif sid in by_id:
            by_id[sid]["mode"] = mode
            by_id[sid]["source"] = "override"
        else:  # user named a skill the router did not route
            by_id[sid] = {"skillId": sid, "mode": mode, "source": "override",
                          "status": "unavailable", "version": None, "digest": None, "order": 999}
    out = dict(snapshot)
    out["skills"] = list(by_id.values())
    return out


async def get_stored(db: AsyncSession, story_id: str) -> ExecutionProfile | None:
    return (
        await db.execute(select(ExecutionProfile).where(ExecutionProfile.story_id == story_id))
    ).scalar_one_or_none()


async def resolve_and_persist(
    db: AsyncSession, story, workspace_id: str, text: str, agent: str = "auto", policy=None
) -> ExecutionProfile:
    snapshot = await _resolve(db, workspace_id, text, agent)
    row = await get_stored(db, story.id)
    if row is None:
        row = ExecutionProfile(story_id=story.id, agent=agent, snapshot=snapshot,
                               policy=policy or "suggest", overrides={}, override_history=[])
        db.add(row)
        try:
            await db.flush()
            return row
        except IntegrityError:  # concurrent first-persist of this story — fall through to update
            await db.rollback()
            row = await get_stored(db, story.id)
    # update path (existing row, or one created concurrently)
    row.snapshot = snapshot  # refresh base; overrides + history preserved
    row.agent = agent
    if policy is not None:
        row.policy = policy
    await db.flush()
    return row


async def is_stale(db: AsyncSession, profile: ExecutionProfile, workspace_id: str, text: str) -> bool:
    fresh = await _resolve(db, workspace_id, text, profile.agent)
    return fresh.get("skills") != (profile.snapshot or {}).get("skills")


async def apply_override(db: AsyncSession, profile: ExecutionProfile, changes: list[dict], reason: str) -> ExecutionProfile:
    if profile.policy == "locked":
        raise ProfileLocked("execution profile policy is locked")
    overrides = dict(profile.overrides or {})
    for ch in changes:
        mode = ch["mode"]
        if mode not in _VALID_MODES:
            raise ValueError(f"invalid override mode: {mode!r}")
        overrides[ch["skillId"]] = {"mode": mode}
    profile.overrides = overrides
    profile.override_history = list(profile.override_history or []) + [{"reason": reason, "changes": changes}]
    await db.flush()
    return profile


def to_dict(profile: ExecutionProfile, stale: bool) -> dict:
    return {
        "story_id": profile.story_id,
        "agent": profile.agent,
        "policy": profile.policy,
        "stale": stale,
        "profile": effective(profile.snapshot or {}, profile.overrides or {}),
        "override_history": list(profile.override_history or []),
    }
