from datetime import date

from gigsnano_api.features.cycles.progress import (
    _round_half_up_2dp,
    build_cycle_progress,
    group_for_status,
)
from gigsnano_api.models import Cycle, EStoryStatus, Story


def make_cycle() -> Cycle:
    return Cycle(id="cyc_1", project_id="p1", name="Sprint 1",
                 start_date=date(2026, 7, 1), end_date=date(2026, 7, 11))


def make_stories() -> list[Story]:
    # 4 stories: 1 done, 1 in_progress, 1 in_review, 1 todo; two assigned to u1
    s = [Story(project_id="p1", title=f"S{i}", sort_order=i) for i in range(4)]
    s[0].status = EStoryStatus.DONE
    s[1].status = EStoryStatus.IN_PROGRESS
    s[2].status = EStoryStatus.IN_REVIEW
    s[0].assignee_id = "u1"
    s[1].assignee_id = "u1"
    return s


def test_group_mapping():
    assert group_for_status(EStoryStatus.DONE) == "completed"
    assert group_for_status(EStoryStatus.IN_PROGRESS) == "started"
    assert group_for_status(EStoryStatus.IN_REVIEW) == "started"
    assert group_for_status(EStoryStatus.TODO) == "unstarted"


def test_progress_counts_and_completion():
    out = build_cycle_progress(make_cycle(), make_stories(), today=date(2026, 7, 6))
    assert out["cycle_id"] == "cyc_1"
    assert out["scope"] == 4
    assert out["counts"] == {
        "completed": 1, "started": 2, "unstarted": 1, "backlog": 0, "cancelled": 0,
    }
    assert out["completion_pct"] == 25
    assert out["assignees"] == [{"user_id": "u1", "completed": 1, "total": 2}]


def test_burndown_shape_and_leading_by():
    # 10-day cycle, day 5: ideal pending = 4*(1-5/10) = 2.0; actual pending = 3
    out = build_cycle_progress(make_cycle(), make_stories(), today=date(2026, 7, 6))
    burndown = out["burndown"]
    assert len(burndown) == 11  # inclusive of both ends
    assert burndown[0] == {"date": "2026-07-01", "scope": 4, "ideal": 4.0, "pending": 4}
    assert burndown[5]["ideal"] == 2.0
    assert burndown[5]["pending"] == 3
    assert burndown[6]["pending"] is None  # future days
    assert out["leading_by"] == -1  # behind by one story


def test_round_half_up_diverges_from_bankers_rounding():
    # Python's round(0.125, 2) == 0.12 (round-half-to-even); the frontend's
    # .toFixed(2) rounds half-away-from-zero and gives "0.13".
    assert round(0.125, 2) == 0.12
    assert _round_half_up_2dp(0.125) == 0.13


def test_ideal_burndown_rounds_half_up_not_bankers():
    # 1-story, 8-day cycle: on day 7 the ideal pending is 1*(1-7/8) == 0.125,
    # an exact x.xx5 boundary where round() and half-up rounding disagree.
    cycle = Cycle(id="cyc_3", project_id="p1", name="Sprint 2",
                  start_date=date(2026, 7, 1), end_date=date(2026, 7, 9))
    stories = [Story(project_id="p1", title="Only", sort_order=0)]
    out = build_cycle_progress(cycle, stories, today=date(2026, 7, 1))
    assert out["burndown"][7]["ideal"] == 0.13
