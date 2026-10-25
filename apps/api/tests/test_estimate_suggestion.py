"""GIN-332: estimate suggestions are evidence-backed, deterministic, advisory, and
honest about thin history and non-Points modes."""

from gigsnano_api.lib.estimate_suggestion import (
    HistoricalItem,
    suggest_estimate,
)


def _hist(pairs):
    return [HistoricalItem(id=i, story_type=t, points=p) for i, t, p in pairs]


def test_points_mode_suggests_snapped_median_of_same_type():
    hist = _hist([("a", "story", 3), ("b", "story", 5), ("c", "story", 8), ("d", "bug", 21)])
    s = suggest_estimate("points", "story", hist)
    assert s.applicable and s.suggested_value == 5  # median of 3,5,8, bug excluded
    assert set(s.similar_item_ids) == {"a", "b", "c"}
    assert s.low == 3 and s.high == 8
    assert s.reasons


def test_snaps_off_scale_median_to_nearest_fibonacci():
    hist = _hist([("a", "story", 3), ("b", "story", 5), ("c", "story", 5), ("d", "story", 8)])
    # median of 3,5,5,8 = 5 → on-scale; test an off-scale case:
    hist2 = _hist([("a", "story", 3), ("b", "story", 5)])  # median 4 → snaps to 3 or 5
    s = suggest_estimate("points", "story", hist2)
    assert s.suggested_value in (3, 5)


def test_widens_to_all_when_too_few_same_type():
    hist = _hist([("a", "story", 5), ("b", "bug", 8), ("c", "bug", 13), ("d", "bug", 8)])
    s = suggest_estimate("points", "story", hist)  # only 1 story → widen to all 4
    assert len(s.similar_item_ids) == 4


def test_confidence_degrades_with_thin_history():
    assert suggest_estimate("points", "story", _hist([("a", "story", 5)])).confidence == "low"
    many = _hist([(str(i), "story", 5) for i in range(15)])
    assert suggest_estimate("points", "story", many).confidence == "high"


def test_no_history_gives_no_value_not_zero():
    s = suggest_estimate("points", "story", [])
    assert s.applicable and s.suggested_value is None and s.confidence == "none"


def test_automatic_mode_is_not_applicable_and_estimate_free():
    s = suggest_estimate("automatic", "story", _hist([("a", "story", 5)]))
    assert not s.applicable and s.suggested_value is None
    assert "estimate-free" in s.reasons[0]


def test_unsupported_mode_returns_not_applicable():
    s = suggest_estimate("time", "story", _hist([("a", "story", 5)]))
    assert not s.applicable and s.suggested_value is None


def test_deterministic():
    hist = _hist([("a", "story", 3), ("b", "story", 8), ("c", "story", 5)])
    assert suggest_estimate("points", "story", hist) == suggest_estimate("points", "story", hist)
