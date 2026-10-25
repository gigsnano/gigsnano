"""Execution Profile resolver (GIN-287). Classify a work item, map it through the
routing matrix, and pin each skill to an immutable registry version+digest. Pure
read: no persistence, no mutation. Deterministic — same text + registry state
yields the same digests."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.skills import service as registry
from gigsnano_api.features.task_router.classifier import classify_domain, classify_type
from gigsnano_api.features.task_router.matrix import matrix_for


def _latest_runnable(versions: list):
    """Highest-semver non-revoked version, or None. The registry validates
    versions as X.Y.Z at publish, so parsing is safe; a non-numeric part sorts
    lowest defensively. (Duplicates ~3 lines of GIN-286's _semver_key — consolidate
    into a registry-service helper as a follow-up.)"""
    runnable = [v for v in versions if v.lifecycle != "revoked"]
    if not runnable:
        return None

    def key(v):
        try:
            parsed = tuple(int(p) for p in v.version.split("."))
        except ValueError:
            parsed = (-1,)
        # The version string is a deterministic tiebreak so the defensive
        # non-semver branch never depends on registry row order.
        return (parsed, v.version)

    return max(runnable, key=key)


async def resolve_execution_profile(
    db: AsyncSession, workspace_id: str, text: str, agent: str = "auto"
) -> dict:
    domain, signals = classify_domain(text)
    task_type = classify_type(text)
    entries, gates = matrix_for(task_type, text)

    packages = await registry.list_visible(db, workspace_id)
    # A workspace's own private skill deterministically shadows a public one of
    # the same name (policy precedence + list_visible has no stable order).
    by_name: dict[str, object] = {}
    for p in packages:
        if p.name not in by_name or p.owner_workspace_id == workspace_id:
            by_name[p.name] = p

    skills: list[dict] = []
    for e in entries:
        pkg = by_name.get(e["name"])
        pinned = _latest_runnable(await registry.versions_for(db, pkg.id)) if pkg else None
        if pinned is not None:
            skills.append(
                {
                    "skillId": e["name"],
                    "version": pinned.version,
                    "digest": pinned.digest,
                    "mode": e["mode"],
                    "order": e["order"],
                    "source": "router",
                    "status": "pinned",
                }
            )
        else:
            skills.append(
                {
                    "skillId": e["name"],
                    "version": None,
                    "digest": None,
                    "mode": e["mode"],
                    "order": e["order"],
                    "source": "router",
                    "status": "unavailable",
                    "reason": "no runnable version in registry",
                }
            )

    return {
        "agent": agent,
        "classification": {"work_type": task_type, "domains": [domain], "signals": signals},
        "skills": skills,
        "gates": gates,
        "policy": "suggest",
        "confidence": "high" if len(signals) >= 2 else "medium",
        "citations": [{"type": "signal", "ref": s} for s in signals],
    }
