"""Cycle progress + burn-down — port of the frontend's src/lib/cycle-burndown.ts.

Deterministic given (cycle, stories, today); routes pass date.today().
"""

import math
from datetime import date, timedelta

from gigsnano_api.bmad.unlock import js_round
from gigsnano_api.models import Cycle, EStoryStatus, Story

STATE_GROUPS = ("completed", "started", "unstarted", "backlog", "cancelled")


def _round_half_up_2dp(x: float) -> float:
    """Round to 2dp half-away-from-zero, matching the frontend's `.toFixed(2)`.

    Python's `round(x, 2)` is banker's rounding (round-half-to-even), which
    diverges from `.toFixed(2)` on exact x.xx5 boundaries (e.g. 0.125 -> 0.12
    vs. 0.13).
    """
    return math.floor(x * 100 + 0.5) / 100


def group_for_status(status: EStoryStatus) -> str:
    if status == EStoryStatus.DONE:
        return "completed"
    if status in (EStoryStatus.IN_PROGRESS, EStoryStatus.IN_REVIEW):
        return "started"
    return "unstarted"


def build_cycle_progress(cycle: Cycle, stories: list[Story], today: date) -> dict:
    scope = len(stories)

    counts = {g: 0 for g in STATE_GROUPS}
    for s in stories:
        counts[group_for_status(s.status)] += 1

    completed = counts["completed"]
    pending_now = scope - completed

    start = cycle.start_date or today
    end = cycle.end_date or (start + timedelta(days=14))
    total_days = max(1, (end - start).days)
    today_idx = min(total_days, max(0, (today - start).days))

    burndown = []
    for i in range(total_days + 1):
        ideal = _round_half_up_2dp(scope * (1 - i / total_days))
        pending = None
        if i <= today_idx:
            t = 0 if today_idx == 0 else i / today_idx
            pending = js_round(scope + (pending_now - scope) * t)
        burndown.append(
            {
                "date": (start + timedelta(days=i)).isoformat(),
                "scope": scope,
                "ideal": ideal,
                "pending": pending,
            }
        )

    ideal_pending_today = scope * (1 - today_idx / total_days)
    leading_by = js_round(ideal_pending_today) - pending_now

    by_assignee: dict[str, dict] = {}
    for s in stories:
        if not s.assignee_id:
            continue
        stat = by_assignee.setdefault(
            s.assignee_id, {"user_id": s.assignee_id, "completed": 0, "total": 0}
        )
        stat["total"] += 1
        if s.status == EStoryStatus.DONE:
            stat["completed"] += 1

    return {
        "cycle_id": cycle.id,
        "counts": counts,
        "scope": scope,
        "completion_pct": js_round(completed / scope * 100) if scope > 0 else 0,
        "leading_by": leading_by,
        "burndown": burndown,
        "assignees": list(by_assignee.values()),
    }
