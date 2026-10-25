"""GIN-339: recovery recommendations are evidence-backed, deterministic, ordered,
advisory-only, and silent when there's nothing to recommend."""

from gigsnano_api.lib.health_rules import HealthEvidence
from gigsnano_api.lib.recovery import recommend


def _ev(**kw) -> HealthEvidence:
    base = dict(forecastable=True, confidence="high", forecast_vs_target="on", remaining_units=20)
    base.update(kw)
    return HealthEvidence(**base)


def test_no_adverse_evidence_yields_no_recommendations():
    assert recommend(_ev()) == []


def test_blocked_work_recommends_unblocking_with_ids():
    recs = recommend(_ev(blocked_ids=("s1", "s2")))
    unblock = next(r for r in recs if r.action == "unblock_dependency")
    assert unblock.contributing_ids == ("s1", "s2")
    assert "2" in unblock.title
    # Every recommendation discloses assumption + decision + impact (AC).
    assert unblock.assumption and unblock.decision_needed and unblock.impact


def test_overdue_recommends_reassessment():
    recs = recommend(_ev(overdue_ids=("a", "b", "c")))
    r = next(r for r in recs if r.action == "reassess_overdue")
    assert r.contributing_ids == ("a", "b", "c")


def test_scope_growth_recommends_deferral_only_above_threshold():
    assert not any(r.action == "defer_scope" for r in recommend(_ev(scope_growth=0.1)))
    assert any(r.action == "defer_scope" for r in recommend(_ev(scope_growth=0.5)))


def test_reopens_recommend_review_only_above_threshold():
    assert not any(r.action == "tighten_review" for r in recommend(_ev(reopened_count=2)))
    assert any(r.action == "tighten_review" for r in recommend(_ev(reopened_count=5)))


def test_adjust_target_only_when_forecast_misses():
    assert not any(r.action == "adjust_target" for r in recommend(_ev(forecast_vs_target="on")))
    off = recommend(_ev(forecast_vs_target="off"))
    r = next(r for r in off if r.action == "adjust_target")
    # Impact is a confidence-qualified statement, never a fabricated exact date.
    assert "85%" in r.impact


def test_recommendations_are_ordered_blockers_before_target_moves():
    recs = recommend(_ev(forecast_vs_target="off", blocked_ids=("x",), overdue_ids=("y",)))
    actions = [r.action for r in recs]
    assert actions.index("unblock_dependency") < actions.index("adjust_target")


def test_deterministic():
    ev = _ev(forecast_vs_target="off", blocked_ids=("x",), scope_growth=0.5, reopened_count=4)
    assert recommend(ev) == recommend(ev)
