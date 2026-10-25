"""Human-confirmed estimate suggestions from project history (GIN-332, deterministic core).

Suggests a points value for a work item from the distribution of *completed*,
points-estimated items in the same project — preferring same-type items — with a
confidence that degrades on thin history and a citation of the items it used. It
is purely advisory: it returns a suggestion, never writes an estimate, and the
caller (UI) must Confirm / Modify / Dismiss.

Deliberately ignores assignee identity and any personal attribute — estimates key
off work characteristics (type, historical points), never who it's assigned to.
Automatic mode is estimate-free (no value); Simple/Time modes don't have stored
values yet, so they return "not applicable" rather than a fabricated number.

Pure and deterministic (history in, suggestion out) so it's testable and its
model version is reproducible. Deferred (documented): semantic similarity from
description/repository context, and persisted suggestion/acceptance feedback for
offline evaluation.
"""

from __future__ import annotations

from dataclasses import dataclass

ESTIMATE_SUGGESTION_VERSION = "history-median-v1"
MIN_SAME_TYPE = 3  # below this, widen to all completed estimated items
LOW_CONF_SAMPLES = 5
MED_CONF_SAMPLES = 12
_FIB = [1, 2, 3, 5, 8, 13, 21]


@dataclass(frozen=True)
class HistoricalItem:
    id: str
    story_type: str
    points: float


@dataclass(frozen=True)
class EstimateSuggestion:
    applicable: bool  # False for estimate-free / unsupported modes
    planning_method: str
    suggested_value: float | None
    low: float | None
    high: float | None
    confidence: str  # "none" | "low" | "medium" | "high"
    reasons: tuple[str, ...] = ()
    similar_item_ids: tuple[str, ...] = ()
    model_version: str = ESTIMATE_SUGGESTION_VERSION


def _median(sorted_vals: list[float]) -> float:
    n = len(sorted_vals)
    mid = n // 2
    return sorted_vals[mid] if n % 2 else (sorted_vals[mid - 1] + sorted_vals[mid]) / 2


def _snap_points(v: float) -> float:
    """Snap to the nearest common (Fibonacci) point so the suggestion is a value the
    user can actually pick, not an off-scale decimal."""
    return float(min(_FIB, key=lambda p: abs(p - v)))


def _confidence(n: int) -> str:
    if n == 0:
        return "none"
    if n < LOW_CONF_SAMPLES:
        return "low"
    return "medium" if n < MED_CONF_SAMPLES else "high"


def suggest_estimate(
    planning_method: str, target_type: str, history: list[HistoricalItem]
) -> EstimateSuggestion:
    if planning_method != "points":
        reason = (
            "This project is estimate-free — item size is inferred from delivery history, "
            "so no points are needed."
            if planning_method == "automatic"
            else "Estimate suggestions aren't available for this planning method yet."
        )
        return EstimateSuggestion(
            applicable=False,
            planning_method=planning_method,
            suggested_value=None,
            low=None,
            high=None,
            confidence="none",
            reasons=(reason,),
        )

    same_type = [h for h in history if h.story_type == target_type]
    used = same_type if len(same_type) >= MIN_SAME_TYPE else history
    if not used:
        return EstimateSuggestion(
            applicable=True,
            planning_method=planning_method,
            suggested_value=None,
            low=None,
            high=None,
            confidence="none",
            reasons=("Not enough completed, estimated work yet to suggest a value.",),
        )

    pts = sorted(h.points for h in used)
    suggested = _snap_points(_median(pts))
    scoped = used is same_type
    reasons = (
        f"Median of {len(used)} completed{' same-type' if scoped else ''} "
        f"item(s) that carried points.",
    )
    return EstimateSuggestion(
        applicable=True,
        planning_method=planning_method,
        suggested_value=suggested,
        low=pts[0],
        high=pts[-1],
        confidence=_confidence(len(used)),
        reasons=reasons,
        similar_item_ids=tuple(h.id for h in used),
    )
