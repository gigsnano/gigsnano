"""GIN-333: delivery-history derivation is deterministic, idempotent, order- and
duplicate-resilient, never double-counts rollups, and records backfill uncertainty."""

from datetime import datetime, timedelta, timezone

from gigsnano_api.lib.delivery_history import (
    EConfidence,
    EDeliveryEvent,
    RawActivity,
    StorySnapshot,
    cycle_times,
    derive_events,
    execution_unit_ids,
    scope_delta,
    scope_state,
    throughput,
)

UTC = timezone.utc


def _t(day: int, hour: int = 12) -> datetime:
    return datetime(2026, 7, day, hour, 0, tzinfo=UTC)


def _leaf(sid: str, status: str, *, created=_t(1), updated=_t(10), cancelled=None) -> StorySnapshot:
    return StorySnapshot(sid, None, status, created, updated, has_children=False, cancelled_at=cancelled)


def _status(sid: str, old, new, at) -> RawActivity:
    return RawActivity(sid, "status", old, new, at)


def test_full_lifecycle_reconstructs_deterministically():
    acts = [
        RawActivity("s1", "created", None, None, _t(1)),
        _status("s1", "todo", "in_progress", _t(2)),
        _status("s1", "in_progress", "done", _t(5)),
    ]
    snap = _leaf("s1", "done", created=_t(1), updated=_t(5))
    events = derive_events(acts, [snap])
    kinds = [(e.kind, e.at, e.confidence) for e in events]
    assert kinds == [
        (EDeliveryEvent.CREATED, _t(1), EConfidence.EXACT),
        (EDeliveryEvent.STARTED, _t(2), EConfidence.EXACT),
        (EDeliveryEvent.COMPLETED, _t(5), EConfidence.EXACT),
    ]


def test_duplicate_events_do_not_change_results():
    acts = [_status("s1", "todo", "done", _t(5))]
    snap = _leaf("s1", "done", updated=_t(5))
    once = derive_events(acts, [snap])
    twice = derive_events(acts + acts + acts, [snap])  # same facts, thrice
    assert once == twice


def test_out_of_order_input_is_order_independent():
    acts = [
        _status("s1", "in_progress", "done", _t(5)),
        RawActivity("s1", "created", None, None, _t(1)),
        _status("s1", "todo", "in_progress", _t(2)),
    ]
    snap = _leaf("s1", "done", updated=_t(5))
    assert derive_events(acts, [snap]) == derive_events(list(reversed(acts)), [snap])


def test_reopen_is_distinguishable_and_returns_to_remaining_scope():
    acts = [
        _status("s1", "in_progress", "done", _t(5)),
        _status("s1", "done", "in_progress", _t(7)),  # reopened
    ]
    snap = _leaf("s1", "in_progress", updated=_t(7))  # currently NOT done
    events = derive_events(acts, [snap])
    assert any(e.kind == EDeliveryEvent.COMPLETED for e in events)
    assert any(e.kind == EDeliveryEvent.REOPENED for e in events)
    # Reopened work is back in remaining scope, not counted as delivered.
    st = scope_state([snap])
    assert (st.remaining, st.delivered) == (1, 0)


def test_reopened_then_recompleted_counts_two_completions_for_throughput():
    acts = [
        _status("s1", "todo", "done", _t(2)),
        _status("s1", "done", "in_progress", _t(3)),
        _status("s1", "in_progress", "done", _t(9)),
    ]
    snap = _leaf("s1", "done", updated=_t(9))
    events = derive_events(acts, [snap])
    completes = [e for e in events if e.kind == EDeliveryEvent.COMPLETED]
    assert len(completes) == 2
    buckets = throughput(events, {"s1"}, now=_t(15), periods=3, period_days=7)
    assert sum(b.completed for b in buckets) == 2


def test_backfill_records_uncertainty():
    # Story is done but predates the activity log (no status rows).
    snap = _leaf("s1", "done", created=_t(1), updated=_t(8))
    events = derive_events([], [snap])
    completed = next(e for e in events if e.kind == EDeliveryEvent.COMPLETED)
    assert completed.confidence == EConfidence.APPROXIMATE
    assert completed.at == _t(8)  # inferred from updated_at, not fabricated precise


def test_parent_child_rollup_does_not_double_count():
    parent = StorySnapshot("p", None, "in_progress", _t(1), _t(9), has_children=True)
    c1 = StorySnapshot("c1", "p", "done", _t(1), _t(4), has_children=False)
    c2 = StorySnapshot("c2", "p", "todo", _t(1), _t(4), has_children=False)
    snaps = [parent, c1, c2]
    assert execution_unit_ids(snaps) == {"c1", "c2"}  # parent excluded
    st = scope_state(snaps)
    assert (st.total, st.delivered, st.remaining) == (2, 1, 0 + 1)


def test_cancelled_work_is_separate_from_delivery():
    delivered = _leaf("s1", "done", updated=_t(5))
    cancelled = _leaf("s2", "todo", cancelled=_t(6))
    snaps = [delivered, cancelled]
    assert execution_unit_ids(snaps) == {"s1"}  # cancelled unit excluded
    st = scope_state(snaps)
    assert (st.delivered, st.cancelled, st.total) == (1, 1, 1)
    events = derive_events([], snaps)
    assert any(e.kind == EDeliveryEvent.CANCELLED and e.story_id == "s2" for e in events)


def test_throughput_buckets_place_completions_in_the_right_week():
    events = [
        # two done in the last week, one the week before
        RawActivity("a", "status", "todo", "done", _t(14)),
        RawActivity("b", "status", "todo", "done", _t(13)),
        RawActivity("c", "status", "todo", "done", _t(6)),
    ]
    snaps = [_leaf("a", "done"), _leaf("b", "done"), _leaf("c", "done")]
    evs = derive_events(events, snaps)
    units = execution_unit_ids(snaps)
    buckets = throughput(evs, units, now=_t(15), periods=2, period_days=7)
    assert [b.completed for b in buckets] == [1, 2]  # [week -2..-1, last week]


def test_cycle_time_uses_start_else_created_approximate():
    exact = derive_events(
        [
            RawActivity("s1", "created", None, None, _t(1)),
            _status("s1", "todo", "in_progress", _t(3)),
            _status("s1", "in_progress", "done", _t(8)),
        ],
        [_leaf("s1", "done", updated=_t(8))],
    )
    (sample,) = cycle_times(exact, {"s1"})
    assert sample.days == 5.0 and sample.confidence == EConfidence.EXACT

    # No start recorded → created→done, flagged approximate.
    no_start = derive_events(
        [RawActivity("s2", "created", None, None, _t(1)), _status("s2", "todo", "done", _t(6))],
        [_leaf("s2", "done", created=_t(1), updated=_t(6))],
    )
    (s2,) = cycle_times(no_start, {"s2"})
    assert s2.days == 5.0 and s2.confidence == EConfidence.APPROXIMATE


def test_scope_delta_reports_added_and_removed():
    baseline = {"a", "b", "c"}
    current = [_leaf("b", "done"), _leaf("c", "todo"), _leaf("d", "todo")]  # a removed, d added
    delta = scope_delta(baseline, current)
    assert delta.added == ("d",)
    assert delta.removed == ("a",)
    assert delta.unchanged == 2
