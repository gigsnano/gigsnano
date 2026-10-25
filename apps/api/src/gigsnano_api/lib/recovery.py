"""Evidence-backed recovery recommendations (GIN-339, deterministic core).

From the same health evidence the rules engine (GIN-336) scores, propose concrete
recovery scenarios — unblock dependencies, defer scope, reassess overdue work,
adjust the target, tighten review. Each recommendation cites the metric and the
contributing work items, states its assumption and the decision needed, and
describes impact **qualitatively / as a range** — it never promises an exact
recovered date, and it never mutates anything (advice only).

Pure and deterministic (evidence in, ordered recommendations out) so it's
testable and reproducible. Insufficient evidence yields no recommendations rather
than unsupported advice.

Deferred (documented): per-scenario re-forecast to quantify the date shift, AI
summarize/prioritize, and the alerting side of GIN-339 (material-change
notifications + dedupe/throttle + accept/dismiss tracking) — those need forecast
snapshots (GIN-335 s2) and the notification system.
"""

from __future__ import annotations

from dataclasses import dataclass

from gigsnano_api.lib.health_rules import HealthEvidence

RECOVERY_VERSION = "recovery-v1"


@dataclass(frozen=True)
class Recommendation:
    action: str  # machine code
    title: str
    rationale: str  # cites the evidence/metric
    assumption: str
    decision_needed: str
    impact: str  # a range / qualitative statement — never an exact date
    contributing_ids: tuple[str, ...] = ()


# Priority so the most impactful scenario sorts first (blockers before target moves).
_PRIORITY = {
    "unblock_dependency": 1,
    "reassess_overdue": 2,
    "defer_scope": 3,
    "tighten_review": 4,
    "adjust_target": 5,
}


def recommend(ev: HealthEvidence) -> list[Recommendation]:
    recs: list[Recommendation] = []

    if ev.blocked_ids:
        n = len(ev.blocked_ids)
        recs.append(
            Recommendation(
                action="unblock_dependency",
                title=f"Unblock {n} blocked item(s)",
                rationale=f"{n} item(s) are blocked by still-open work on the critical path.",
                assumption="The blockers are the binding constraint on flow.",
                decision_needed="Owner to expedite or reassign the blocking work.",
                impact=f"Could return up to {n} item(s) to active flow and pull the forecast earlier.",
                contributing_ids=ev.blocked_ids,
            )
        )

    if ev.overdue_ids:
        n = len(ev.overdue_ids)
        recs.append(
            Recommendation(
                action="reassess_overdue",
                title=f"Reassess {n} overdue item(s)",
                rationale=f"{n} item(s) are already past their target date.",
                assumption="Overdue dates are stale, not a live commitment.",
                decision_needed="PM to re-date, re-scope or expedite each overdue item.",
                impact="Clearing stale dates removes a persistent At-risk signal.",
                contributing_ids=ev.overdue_ids,
            )
        )

    if ev.scope_growth > 0.30:
        recs.append(
            Recommendation(
                action="defer_scope",
                title="Defer recently added scope",
                rationale=f"Scope grew by ~{round(ev.scope_growth * 100)}% in the recent window.",
                assumption="Some recent additions are not required for the target.",
                decision_needed="PM/stakeholders to confirm what can move out of this delivery.",
                impact="Deferring non-critical additions reduces remaining scope, pulling the forecast earlier.",
            )
        )

    if ev.reopened_count > 2:
        recs.append(
            Recommendation(
                action="tighten_review",
                title="Tighten review to cut rework",
                rationale=f"{ev.reopened_count} item(s) were reopened recently.",
                assumption="Reopens reflect quality gaps, not scope changes.",
                decision_needed="Add a review/QA step before Done for the affected areas.",
                impact="Fewer reopens returns throughput that rework is currently consuming.",
            )
        )

    # Only suggest moving the target when the forecast actually misses it and the
    # above levers may not be enough — never as the first resort.
    if ev.forecast_vs_target == "off":
        recs.append(
            Recommendation(
                action="adjust_target",
                title="Realign the target with the forecast",
                rationale="The target is earlier than the 50% forecast.",
                assumption="Scope and capacity are fixed for this delivery.",
                decision_needed="Stakeholders to accept a later target or approve scope/capacity change.",
                impact="Moving the target to the 85% forecast date restores an On-track reading with 85% confidence.",
            )
        )

    recs.sort(key=lambda r: _PRIORITY.get(r.action, 99))
    return recs
