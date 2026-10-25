"""Normalized delivery history for throughput/cycle-time/scope forecasting (GIN-333).

The analytical foundation the forecasting engine (GIN-334) reads from. It is a
pure derivation layer over data GigsNano already records — it does NOT introduce a
parallel event-sourcing store:

- **Events** come from the existing `story_activities` log (status transitions,
  creation) plus each story's current snapshot. A transition to `done` is a
  COMPLETED event; `done`→anything is a REOPENED; first entry into a working
  status is STARTED; soft-delete is CANCELLED.
- **Provenance/confidence** is explicit: an event derived from a real timestamped
  activity is EXACT; one inferred from current state (the activity log only
  starts 2026-07-06, so older stories have no rows) is APPROXIMATE. Synthetic
  timestamps are never presented as exact.
- **Execution units** are leaf stories only — a parent with children is never
  counted alongside them, so rollups don't double-count.
- **Scope** distinguishes remaining, delivered and cancelled work, and a current
  snapshot can be diffed against a versioned baseline.

Everything here is pure and DB-agnostic (plain dataclasses in, dataclasses out)
so the lifecycle rules are deterministic and property-testable without a database.
Idempotent by construction: duplicate activities collapse to identical events, and
out-of-order input is sorted before derivation, so results depend only on the set
of facts, not their arrival order.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum

# EStoryStatus values (mirrored, not imported, to keep this layer ORM-free).
STARTED_STATUSES = frozenset({"in_progress", "in_review"})
DONE_STATUS = "done"
PERIOD_DAYS_DEFAULT = 7


class EDeliveryEvent(str, Enum):
    CREATED = "created"
    STARTED = "started"
    COMPLETED = "completed"
    REOPENED = "reopened"
    CANCELLED = "cancelled"


class EConfidence(str, Enum):
    EXACT = "exact"  # from a real timestamped activity row
    APPROXIMATE = "approximate"  # inferred from current state (pre-log-cutover)


@dataclass(frozen=True)
class RawActivity:
    """One `story_activities` row, reduced to what delivery history needs."""

    story_id: str
    field: str  # "status" | "created" | ...
    old_value: str | None
    new_value: str | None
    at: datetime


@dataclass(frozen=True)
class StorySnapshot:
    """Current state of one story (leaf/parent, status, timestamps)."""

    id: str
    parent_id: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    has_children: bool
    cancelled_at: datetime | None = None  # soft-delete time, if trashed


@dataclass(frozen=True)
class DeliveryEvent:
    story_id: str
    kind: EDeliveryEvent
    at: datetime
    confidence: EConfidence


@dataclass(frozen=True)
class ThroughputBucket:
    period_start: datetime
    period_end: datetime
    completed: int


@dataclass(frozen=True)
class CycleSample:
    story_id: str
    days: float
    confidence: EConfidence


@dataclass(frozen=True)
class ScopeState:
    """Current execution-unit scope. `remaining` + `delivered` = active units;
    `cancelled` is tracked apart from delivery (never counts as throughput)."""

    total: int
    remaining: int
    delivered: int
    cancelled: int


@dataclass(frozen=True)
class ScopeDelta:
    added: tuple[str, ...]  # units present now, absent from baseline
    removed: tuple[str, ...]  # units in baseline, gone now (cancelled/deleted)
    unchanged: int


def _as_utc(dt: datetime) -> datetime:
    """Naive datetimes are assumed UTC; aware ones are converted. All internal
    comparison/bucketing is in UTC so DST and mixed tz-awareness can't skew it."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _story_events(acts: list[RawActivity], snap: StorySnapshot) -> list[DeliveryEvent]:
    """Derive one story's lifecycle events from its (unordered) activities + snapshot."""
    ordered = sorted(acts, key=lambda a: _as_utc(a.at))
    events: list[DeliveryEvent] = []

    created = next((a for a in ordered if a.field == "created"), None)
    events.append(
        DeliveryEvent(
            snap.id,
            EDeliveryEvent.CREATED,
            _as_utc(created.at) if created else _as_utc(snap.created_at),
            EConfidence.EXACT if created else EConfidence.APPROXIMATE,
        )
    )

    had_status = saw_complete = False
    for a in ordered:
        if a.field != "status":
            continue
        had_status = True
        old, new = a.old_value, a.new_value
        if new == DONE_STATUS:
            events.append(DeliveryEvent(snap.id, EDeliveryEvent.COMPLETED, _as_utc(a.at), EConfidence.EXACT))
            saw_complete = True
        elif old == DONE_STATUS and new != DONE_STATUS:
            events.append(DeliveryEvent(snap.id, EDeliveryEvent.REOPENED, _as_utc(a.at), EConfidence.EXACT))
        if new in STARTED_STATUSES and old not in STARTED_STATUSES:
            events.append(DeliveryEvent(snap.id, EDeliveryEvent.STARTED, _as_utc(a.at), EConfidence.EXACT))

    # Backfill for stories older than the activity log (no status rows at all):
    # infer from current status, marked APPROXIMATE so downstream never treats the
    # timestamp as precise. A currently-working story gets an approximate start; a
    # currently-done pre-log story gets an approximate completion (its cycle time
    # then anchors on CREATED, since no real start was ever observed).
    if not had_status and snap.status in STARTED_STATUSES:
        events.append(DeliveryEvent(snap.id, EDeliveryEvent.STARTED, _as_utc(snap.updated_at), EConfidence.APPROXIMATE))
    if not saw_complete and snap.status == DONE_STATUS:
        events.append(DeliveryEvent(snap.id, EDeliveryEvent.COMPLETED, _as_utc(snap.updated_at), EConfidence.APPROXIMATE))

    if snap.cancelled_at is not None:
        events.append(DeliveryEvent(snap.id, EDeliveryEvent.CANCELLED, _as_utc(snap.cancelled_at), EConfidence.EXACT))

    return events


def derive_events(activities: list[RawActivity], snapshots: list[StorySnapshot]) -> list[DeliveryEvent]:
    """All delivery events across the given stories, deduplicated and time-ordered.

    Idempotent: identical activities produce identical events, which collapse via a
    set. Order-independent: input is sorted, so late/out-of-order events yield the
    same result without erasing newer facts."""
    by_story: dict[str, list[RawActivity]] = defaultdict(list)
    for a in activities:
        by_story[a.story_id].append(a)

    seen: set[DeliveryEvent] = set()
    for snap in snapshots:
        for ev in _story_events(by_story.get(snap.id, []), snap):
            seen.add(ev)  # frozen dataclass is hashable → exact dups vanish
    return sorted(seen, key=lambda e: (e.at, e.story_id, e.kind.value))


def execution_unit_ids(snapshots: list[StorySnapshot]) -> set[str]:
    """Leaf stories that are not cancelled — the units counted for throughput/scope.
    A parent (has_children) is excluded so it's never counted with its descendants."""
    return {s.id for s in snapshots if not s.has_children and s.cancelled_at is None}


def _bucket_start(dt: datetime, origin: datetime, period: timedelta) -> datetime:
    delta = _as_utc(dt) - origin
    n = delta // period
    return origin + n * period


def throughput(
    events: list[DeliveryEvent],
    unit_ids: set[str],
    *,
    now: datetime,
    periods: int = 12,
    period_days: int = PERIOD_DAYS_DEFAULT,
) -> list[ThroughputBucket]:
    """Completions per period for execution units, most recent `periods` buckets.

    Each COMPLETED event counts once at its date; a reopened-then-recompleted item
    contributes another completion (it consumed delivery capacity again). Parent
    rollups are excluded via `unit_ids`."""
    period = timedelta(days=period_days)
    now_u = _as_utc(now)
    # Anchor buckets to `now` so the newest bucket ends at now.
    origin = now_u - period * periods
    counts: dict[datetime, int] = defaultdict(int)
    for e in events:
        if e.kind != EDeliveryEvent.COMPLETED or e.story_id not in unit_ids:
            continue
        if e.at <= origin or e.at > now_u:
            continue
        counts[_bucket_start(e.at, origin, period)] += 1
    return [
        ThroughputBucket(origin + i * period, origin + (i + 1) * period, counts.get(origin + i * period, 0))
        for i in range(periods)
    ]


def cycle_times(events: list[DeliveryEvent], unit_ids: set[str]) -> list[CycleSample]:
    """One sample per COMPLETED unit: start→complete, or created→complete when no
    start was recorded (approximate). Negative spans (clock skew / bad ordering)
    are dropped rather than poisoning the distribution."""
    by_story: dict[str, list[DeliveryEvent]] = defaultdict(list)
    for e in events:
        if e.story_id in unit_ids:
            by_story[e.story_id].append(e)

    samples: list[CycleSample] = []
    for sid, evs in by_story.items():
        evs.sort(key=lambda e: e.at)
        created = next((e for e in evs if e.kind == EDeliveryEvent.CREATED), None)
        for comp in [e for e in evs if e.kind == EDeliveryEvent.COMPLETED]:
            start = None
            for e in evs:
                if e.kind == EDeliveryEvent.STARTED and e.at <= comp.at:
                    start = e
            anchor = start or created
            if anchor is None:
                continue
            span = (comp.at - anchor.at).total_seconds()
            if span < 0:
                continue
            # EXACT only for a real observed start→complete with exact timestamps.
            # A created→complete fallback (no start ever seen) is lead time used as a
            # cycle-time proxy — always APPROXIMATE, however precise the timestamps.
            exact = (
                start is not None
                and comp.confidence == EConfidence.EXACT
                and anchor.confidence == EConfidence.EXACT
            )
            samples.append(
                CycleSample(sid, span / 86400.0, EConfidence.EXACT if exact else EConfidence.APPROXIMATE)
            )
    return samples


def scope_state(snapshots: list[StorySnapshot]) -> ScopeState:
    """Current scope over execution units: delivered (done), remaining (not done),
    and cancelled counted separately (removed from delivery, not counted as done)."""
    units = [s for s in snapshots if not s.has_children]
    cancelled = sum(1 for s in units if s.cancelled_at is not None)
    active = [s for s in units if s.cancelled_at is None]
    delivered = sum(1 for s in active if s.status == DONE_STATUS)
    return ScopeState(
        total=len(active),
        remaining=len(active) - delivered,
        delivered=delivered,
        cancelled=cancelled,
    )


def scope_delta(baseline_unit_ids: set[str], current_snapshots: list[StorySnapshot]) -> ScopeDelta:
    """Diff current execution units against a versioned baseline set: what scope was
    added and what was removed (cancelled/deleted) since the baseline was taken."""
    current = execution_unit_ids(current_snapshots)
    added = tuple(sorted(current - baseline_unit_ids))
    removed = tuple(sorted(baseline_unit_ids - current))
    return ScopeDelta(added=added, removed=removed, unchanged=len(current & baseline_unit_ids))
