"""The autonomy decision (GIN-387): may this action run by itself, or does it need
a named human?

Pure on purpose. The answer must be identical whether it is reached from the MCP
request endpoint, a control run (GIN-388) or a recovery plan (GIN-385), and it has
to be testable without a database — this is the only thing standing between an
agent and a project's committed scope.

The default answer is "ask": an action is auto-approved only when the policy
positively allows it, is inside every limit, and the director is not paused.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from gigsnano_api.models import DEFAULT_RESTRICTED


@dataclass(frozen=True)
class Limits:
    """The policy's numbers, extracted so the rules never touch an ORM object."""

    max_items_per_run: int = 25
    max_date_shift_days: int = 7
    max_priority_changes: int = 10
    max_reassignments: int = 5


@dataclass(frozen=True)
class PolicyView:
    """A policy as the rules see it. A project with no policy row gets this, with
    the conservative defaults."""

    paused: bool = False
    paused_reason: str = ""
    limits: Limits = Limits()
    restricted_actions: tuple[str, ...] = DEFAULT_RESTRICTED
    allowed_status_transitions: tuple[tuple[str, str], ...] | None = None
    quiet_hours_start: int | None = None
    quiet_hours_end: int | None = None


@dataclass(frozen=True)
class ActionRequest:
    """What the director wants to do, in the terms the limits are written in."""

    action: str
    item_count: int = 1
    date_shift_days: int = 0
    priority_changes: int = 0
    reassignments: int = 0
    status_transition: tuple[str, str] | None = None


@dataclass(frozen=True)
class Decision:
    allowed: bool  # may it proceed at all, right now, unattended
    requires_approval: bool
    reasons: tuple[str, ...]  # every reason, so the human sees the whole picture

    @property
    def summary(self) -> str:
        return "; ".join(self.reasons) if self.reasons else "within policy"

    def as_dict(self) -> dict:
        return {
            "allowed": self.allowed,
            "requires_approval": self.requires_approval,
            "reasons": list(self.reasons),
            "summary": self.summary,
        }


def in_quiet_hours(policy: PolicyView, now: datetime) -> bool:
    """Quiet hours may wrap midnight (22 -> 7), which a naive start <= h < end
    comparison gets exactly backwards for the hours that matter."""
    start, end = policy.quiet_hours_start, policy.quiet_hours_end
    if start is None or end is None or start == end:
        return False
    hour = now.hour
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def evaluate(policy: PolicyView, request: ActionRequest, *, now: datetime) -> Decision:
    """Decide one action. Every violated rule is reported, not just the first —
    a human approving this needs the whole picture, not a taste of it."""
    reasons: list[str] = []

    if policy.paused:
        detail = f": {policy.paused_reason}" if policy.paused_reason else ""
        return Decision(
            allowed=False,
            requires_approval=True,
            reasons=(f"The project director is paused{detail}.",),
        )

    restricted = request.action in policy.restricted_actions
    if restricted:
        reasons.append(f"'{request.action}' always requires human approval under this policy.")

    limits = policy.limits
    if request.item_count > limits.max_items_per_run:
        reasons.append(
            f"{request.item_count} work items exceeds the limit of "
            f"{limits.max_items_per_run} per run."
        )
    if abs(request.date_shift_days) > limits.max_date_shift_days:
        reasons.append(
            f"A {abs(request.date_shift_days)}-day date shift exceeds the limit of "
            f"{limits.max_date_shift_days} days."
        )
    if request.priority_changes > limits.max_priority_changes:
        reasons.append(
            f"{request.priority_changes} priority changes exceeds the limit of "
            f"{limits.max_priority_changes}."
        )
    if request.reassignments > limits.max_reassignments:
        reasons.append(
            f"{request.reassignments} reassignments exceeds the limit of "
            f"{limits.max_reassignments}."
        )

    move = request.status_transition
    if move and policy.allowed_status_transitions is not None:
        if tuple(move) not in {tuple(t) for t in policy.allowed_status_transitions}:
            reasons.append(
                f"The status move {move[0]} -> {move[1]} is not in this project's "
                f"allowed transitions."
            )

    if in_quiet_hours(policy, now):
        reasons.append(
            f"It is quiet hours ({policy.quiet_hours_start}:00-{policy.quiet_hours_end}:00); "
            f"autonomous changes wait for a human."
        )

    # Anything outside policy is *proposable* — it becomes a pending action a human
    # can approve. Only a paused director refuses outright (returned above).
    return Decision(
        allowed=not reasons,
        requires_approval=bool(reasons),
        reasons=tuple(reasons),
    )
