"""Digest delivery timing + weekday rules (GIN-128).

These are pure-function tests over `digest_due_date` — no DB, no event loop, no
clock mocking. The scheduling risk lives entirely in timezone arithmetic (DST,
midnight, the dateline, non-whole-hour offsets), and that arithmetic is
reachable without any of the machinery around it.

`deliveries_over` simulates what the scheduler actually does: walk the tick grid
and let the delivery table's (user, workspace, local-date) uniqueness collapse
catch-up ticks into one send. `digest_due_date` deliberately answers "is it time
yet" (and keeps saying yes, so a missed tick can't drop a day); "has it already
happened" is the DB's half. Asserting exactly-once therefore means simulating
both halves, which is what this helper is for.
"""

from datetime import UTC, date, datetime, timedelta

from gigsnano_api.features.digests.scheduler import TICK_MINUTES, seconds_until_next_tick
from gigsnano_api.features.digests.service import digest_due_date
from gigsnano_api.models import DigestPreference

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)


def prefs(tz="UTC", hour=8, weekdays=None, enabled=True) -> DigestPreference:
    return DigestPreference(
        user_id="u1",
        enabled=enabled,
        timezone=tz,
        digest_hour=hour,
        digest_weekdays=list(range(7)) if weekdays is None else weekdays,
        template="default",
        statuses=["todo"],
        channels=["email"],
    )


def utc(y, m, d, hh=0, mm=0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=UTC)


def deliveries_over(pref, start_utc, *, days=1, tick_minutes=TICK_MINUTES):
    """Every tick that would actually send, over `days` from `start_utc`.

    Mirrors the scheduler + the delivery table's uniqueness: a local date is
    delivered at most once, however many ticks report it due.

    Joins a scheduler that has been running all along, rather than one booting
    from an empty delivery table: anything already inside its window at
    `start_utc` was delivered before we started watching, so it is pre-seeded and
    doesn't count as a fresh send. Without this every zone behind UTC shows a
    phantom extra delivery for the local day already in progress — an artifact of
    where the simulation happens to start, not of the schedule.
    """
    delivered: set[date] = set()
    seeded = digest_due_date(pref, start_utc)
    if seeded is not None:
        delivered.add(seeded)
    fired: list[tuple[datetime, date]] = []
    tick, end = start_utc, start_utc + timedelta(days=days)
    while tick < end:
        due = digest_due_date(pref, tick)
        if due is not None and due not in delivered:
            delivered.add(due)
            fired.append((tick, due))
        tick += timedelta(minutes=tick_minutes)
    return fired


# --- the basics -------------------------------------------------------------


def test_fires_at_the_chosen_hour_and_not_before():
    p = prefs(tz="UTC", hour=8)
    assert digest_due_date(p, utc(2026, 7, 13, 7, 45)) is None
    assert digest_due_date(p, utc(2026, 7, 13, 8, 0)) == date(2026, 7, 13)


def test_disabled_user_is_never_due():
    p = prefs(enabled=False)
    assert deliveries_over(p, utc(2026, 7, 13), days=7) == []


def test_no_preference_row_defaults_to_every_day_at_0900_kolkata():
    """Everyone is on this path today — digest_preferences is empty in prod.
    09:00 Asia/Kolkata is 03:30 UTC, and the :30 is the whole reason the tick
    grid is 15 minutes rather than hourly."""
    assert digest_due_date(None, utc(2026, 7, 13, 3, 15)) is None
    assert digest_due_date(None, utc(2026, 7, 13, 3, 30)) == date(2026, 7, 13)
    assert len(deliveries_over(None, utc(2026, 7, 13), days=7)) == 7


def test_exactly_one_delivery_per_day():
    p = prefs(tz="Europe/Berlin", hour=9)
    fired = deliveries_over(p, utc(2026, 7, 13), days=7)
    assert len(fired) == 7
    assert len({d for _, d in fired}) == 7  # seven distinct local dates


# --- timezone conversion ----------------------------------------------------


def test_hour_is_local_not_utc():
    # Denver is -06:00 in July, so 07:00 local == 13:00 UTC.
    p = prefs(tz="America/Denver", hour=7)
    assert digest_due_date(p, utc(2026, 7, 13, 12, 45)) is None
    assert digest_due_date(p, utc(2026, 7, 13, 13, 0)) == date(2026, 7, 13)


def test_half_hour_offset_lands_on_a_tick_exactly():
    """Kolkata is +05:30: 09:00 local is 03:30 UTC, which only exists on the tick
    grid because the grid is 15 minutes. This is the whole reason it isn't hourly."""
    p = prefs(tz="Asia/Kolkata", hour=9)
    fired = deliveries_over(p, utc(2026, 7, 13), days=1)
    assert [t for t, _ in fired] == [utc(2026, 7, 13, 3, 30)]


def test_quarter_hour_offset_lands_on_a_tick_exactly():
    # Kathmandu is +05:45 — the most awkward real offset there is.
    p = prefs(tz="Asia/Kathmandu", hour=9)
    fired = deliveries_over(p, utc(2026, 7, 13), days=1)
    assert [t for t, _ in fired] == [utc(2026, 7, 13, 3, 15)]


def test_users_in_different_zones_get_their_own_hour_from_one_tick_grid():
    kolkata = prefs(tz="Asia/Kolkata", hour=9)  # 03:30 UTC
    denver = prefs(tz="America/Denver", hour=9)  # 15:00 UTC
    berlin = prefs(tz="Europe/Berlin", hour=9)  # 07:00 UTC
    day = utc(2026, 7, 13)
    assert [t for t, _ in deliveries_over(kolkata, day)] == [utc(2026, 7, 13, 3, 30)]
    assert [t for t, _ in deliveries_over(berlin, day)] == [utc(2026, 7, 13, 7, 0)]
    assert [t for t, _ in deliveries_over(denver, day)] == [utc(2026, 7, 13, 15, 0)]


# --- weekday rules ----------------------------------------------------------


def test_only_selected_weekdays_deliver():
    p = prefs(tz="UTC", hour=8, weekdays=[MON, WED, FRI])
    fired = deliveries_over(p, utc(2026, 7, 13), days=7)  # 2026-07-13 is a Monday
    assert [d.weekday() for _, d in fired] == [MON, WED, FRI]


def test_weekday_is_judged_in_local_time_not_utc():
    """Kiritimati is +14: at 2026-07-13 12:00 UTC (a Monday) it is already Tuesday
    there. A Tuesday-only user must fire; a Monday-only user must not."""
    tuesday_only = prefs(tz="Pacific/Kiritimati", hour=9, weekdays=[TUE])
    monday_only = prefs(tz="Pacific/Kiritimati", hour=9, weekdays=[MON])
    # 09:00 Tue local (2026-07-14) == 19:00 UTC Mon (2026-07-13).
    tick = utc(2026, 7, 13, 19, 0)
    assert digest_due_date(tuesday_only, tick) == date(2026, 7, 14)
    assert digest_due_date(monday_only, tick) is None


def test_dateline_west_local_date_trails_utc():
    """Niue is -11: 09:00 local on 2026-07-13 is 20:00 UTC the same day, and the
    delivered run_date is the user's local date, not the UTC one."""
    p = prefs(tz="Pacific/Niue", hour=9)
    fired = deliveries_over(p, utc(2026, 7, 13), days=1)
    assert fired == [(utc(2026, 7, 13, 20, 0), date(2026, 7, 13))]


# --- DST --------------------------------------------------------------------


def test_dst_spring_forward_does_not_skip_the_day():
    """On 2026-03-08 New York jumps 02:00 -> 03:00, so an hour=2 user's chosen
    hour does not exist. They must still get exactly one digest, at the next real
    local hour (03:00 EDT == 07:00 UTC) — not zero because the hour never matched."""
    p = prefs(tz="America/New_York", hour=2, weekdays=[SUN])
    fired = deliveries_over(p, utc(2026, 3, 8), days=1)
    assert len(fired) == 1
    assert fired[0] == (utc(2026, 3, 8, 7, 0), date(2026, 3, 8))


def test_dst_fall_back_does_not_double_send():
    """On 2026-11-01 New York repeats 01:00 (EDT then EST). The hour comes round
    twice; the digest must not."""
    p = prefs(tz="America/New_York", hour=1, weekdays=[SUN])
    fired = deliveries_over(p, utc(2026, 11, 1), days=1)
    assert len(fired) == 1
    assert fired[0] == (utc(2026, 11, 1, 5, 0), date(2026, 11, 1))  # 01:00 EDT


def test_one_delivery_per_day_across_a_dst_transition_week():
    p = prefs(tz="America/New_York", hour=9)
    fired = deliveries_over(p, utc(2026, 3, 5), days=7)  # spans the 03-08 jump
    assert len(fired) == 7
    assert len({d for _, d in fired}) == 7


# --- boundaries -------------------------------------------------------------


def test_midnight_hour_is_valid():
    p = prefs(tz="Europe/Berlin", hour=0)  # 00:00 CEST == 22:00 UTC previous day
    assert digest_due_date(p, utc(2026, 7, 12, 22, 0)) == date(2026, 7, 13)
    assert digest_due_date(p, utc(2026, 7, 12, 21, 45)) is None


def test_catch_up_a_missed_tick_still_delivers():
    """A tick can be missed (deploy, restart, slow run). The next one must still
    deliver that day rather than wait for tomorrow."""
    p = prefs(tz="UTC", hour=8)
    assert digest_due_date(p, utc(2026, 7, 13, 8, 0)) == date(2026, 7, 13)
    # Scheduler was down for the morning; first tick back is 11:00.
    assert digest_due_date(p, utc(2026, 7, 13, 11, 0)) == date(2026, 7, 13)


def test_catch_up_is_bounded_so_a_stale_digest_is_never_sent():
    """Past the window the day is skipped, not delivered late. Also what stops a
    user who first saves preferences in the evening from getting one instantly."""
    p = prefs(tz="UTC", hour=8)
    assert digest_due_date(p, utc(2026, 7, 13, 13, 59)) == date(2026, 7, 13)  # 5h59 late
    assert digest_due_date(p, utc(2026, 7, 13, 14, 0)) is None  # 6h late — dropped
    assert digest_due_date(p, utc(2026, 7, 13, 22, 0)) is None


def test_unknown_stored_timezone_degrades_to_utc_instead_of_raising():
    """Writes are validated, but a pre-validation row must not crash the tick for
    everyone else in the workspace."""
    p = prefs(tz="Mars/Olympus_Mons", hour=8)
    assert digest_due_date(p, utc(2026, 7, 13, 8, 0)) == date(2026, 7, 13)


# --- the tick grid ----------------------------------------------------------


def test_tick_aligns_to_the_quarter_hour():
    assert seconds_until_next_tick(utc(2026, 7, 13, 9, 0)) == 15 * 60
    assert seconds_until_next_tick(utc(2026, 7, 13, 9, 7)) == 8 * 60
    assert seconds_until_next_tick(utc(2026, 7, 13, 9, 14)) == 60
    assert seconds_until_next_tick(utc(2026, 7, 13, 9, 44)) == 60
    assert seconds_until_next_tick(utc(2026, 7, 13, 9, 59)) == 60


def test_tick_never_returns_zero_and_never_overshoots():
    """A zero-length sleep would spin the loop; an over-long one would drift off
    the grid the quarter-hour offsets depend on."""
    start = utc(2026, 7, 13, 9, 0)
    for i in range(60):
        s = seconds_until_next_tick(start + timedelta(minutes=i))
        assert 0 < s <= TICK_MINUTES * 60
