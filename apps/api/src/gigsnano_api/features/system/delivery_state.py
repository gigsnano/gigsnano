"""Pure Delivery Bundle state machine (GIN-414).

Overall state is a deterministic function of the per-repository states — never
stored, so it can never lie. Only *required* repos (that aren't marked no-change)
gate readiness/merge/Done; reference and no-change repos never block.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

# Overall states.
SCOPE_PROPOSED = "scope_proposed"
IN_DEVELOPMENT = "in_development"
PARTIALLY_READY = "partially_ready"
READY_TO_MERGE = "ready_to_merge"
PARTIALLY_MERGED = "partially_merged"
RELEASED = "released"
ROLLBACK_REQUIRED = "rollback_required"
CANCELLED = "cancelled"


def _gating(repos: Sequence[Mapping]) -> list[Mapping]:
    """Required repos that still have to be delivered (not no-change)."""
    return [r for r in repos if r.get("required") and not r.get("no_change")]


def _is_merged(r: Mapping) -> bool:
    return r.get("merge_state") == "merged"


def _is_ready(r: Mapping) -> bool:
    return (
        bool(r.get("pr_url"))
        and r.get("ci_state") == "passed"
        and r.get("review_state") == "approved"
        and r.get("merge_state") in ("ready", "pending")
    )


def _has_started(r: Mapping) -> bool:
    # A pre-planned branch name is not "started" — real work is a PR or commits.
    return bool(r.get("pr_url")) or (r.get("commit_count") or 0) > 0


def _merge_phase(gating: Sequence[Mapping]) -> str | None:
    if all(_is_merged(r) for r in gating):
        return RELEASED
    if any(_is_merged(r) for r in gating):
        return PARTIALLY_MERGED
    return None


def _ready_phase(gating: Sequence[Mapping], repos: Sequence[Mapping]) -> str:
    if all(_is_ready(r) for r in gating):
        return READY_TO_MERGE
    if any(_is_ready(r) for r in gating):
        return PARTIALLY_READY
    if any(_has_started(r) for r in repos):
        return IN_DEVELOPMENT
    return SCOPE_PROPOSED


def compute_overall_state(
    repos: Sequence[Mapping], *, cancelled: bool = False, rollback_required: bool = False
) -> str:
    if cancelled:
        return CANCELLED
    if rollback_required:
        return ROLLBACK_REQUIRED

    gating = _gating(repos)
    if not gating:
        # Nothing required left to deliver: released if anything shipped, else proposed.
        return RELEASED if any(_is_merged(r) for r in repos) else SCOPE_PROPOSED
    return _merge_phase(gating) or _ready_phase(gating, repos)


def blocking_repos(repos: Sequence[Mapping]) -> list[str]:
    """Required repos not yet merged (and not no-change) — these block work-item Done.
    Returns their project_repository_id list for an actionable explanation."""
    return [r["project_repository_id"] for r in _gating(repos) if not _is_merged(r)]
