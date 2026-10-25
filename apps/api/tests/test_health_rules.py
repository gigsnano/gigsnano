"""GIN-336: health rules are deterministic, evidence-backed, respect precedence and
the low-confidence guard, and never assert green without support."""

from gigsnano_api.lib.health_rules import (
    EHealthStatus,
    HealthEvidence,
    HEALTH_RULES_VERSION,
    score_health,
)


def _ev(**kw) -> HealthEvidence:
    base = dict(forecastable=True, confidence="high", forecast_vs_target="on", remaining_units=20)
    base.update(kw)
    return HealthEvidence(**base)


def test_on_track_when_forecast_meets_target_and_confident():
    r = score_health(_ev())
    assert r.status == EHealthStatus.ON_TRACK
    assert r.reasons[0].code == "forecast_meets_target"
    assert r.rules_version == HEALTH_RULES_VERSION


def test_off_track_dominates_at_risk_signals():
    r = score_health(_ev(forecast_vs_target="off", scope_growth=0.9, reopened_count=5))
    assert r.status == EHealthStatus.OFF_TRACK
    # most-severe reason first
    assert r.reasons[0].code == "forecast_misses_target"


def test_deterministic_same_inputs_same_result():
    ev = _ev(forecast_vs_target="at_risk", overdue_ids=("a", "b"))
    assert score_health(ev) == score_health(ev)


def test_every_non_no_data_status_has_evidence():
    for fvt in ("on", "at_risk", "off"):
        r = score_health(_ev(forecast_vs_target=fvt))
        assert r.status != EHealthStatus.NO_DATA
        assert r.reasons  # non-empty


def test_low_confidence_cannot_assert_on_track():
    r = score_health(_ev(forecast_vs_target="on", confidence="low"))
    assert r.status == EHealthStatus.AT_RISK
    assert any(x.code == "low_confidence" for x in r.reasons)


def test_low_data_is_no_data_not_green():
    r = score_health(_ev(forecastable=False, forecast_vs_target=None, confidence="no_data"))
    assert r.status == EHealthStatus.NO_DATA
    assert r.reasons[0].code == "no_data"


def test_forecastable_without_target_is_no_target():
    r = score_health(_ev(forecast_vs_target=None))
    assert r.status == EHealthStatus.NO_DATA
    assert r.reasons[0].code == "no_target"


def test_critical_blockers_elevate_and_carry_drilldown_ids():
    # No forecast at all, but blocked work still elevates health with evidence.
    r = score_health(
        _ev(forecastable=False, forecast_vs_target=None, remaining_units=4, blocked_ids=("s1", "s2", "s3"))
    )
    assert r.status == EHealthStatus.OFF_TRACK  # 3/4 blocked > 25%
    blocker = next(x for x in r.reasons if x.code == "critical_blockers")
    assert blocker.contributing_ids == ("s1", "s2", "s3")
    assert blocker.metric == 3


def test_overdue_below_share_is_at_risk_not_off():
    r = score_health(_ev(forecast_vs_target="on", remaining_units=20, overdue_ids=("x",)))
    assert r.status == EHealthStatus.AT_RISK  # 1/20 under 25%
    assert any(x.code == "overdue_work" for x in r.reasons)


def test_scope_growth_and_reopens_flag_at_risk_with_metrics():
    r = score_health(_ev(forecast_vs_target="on", scope_growth=0.5, reopened_count=4))
    assert r.status == EHealthStatus.AT_RISK
    growth = next(x for x in r.reasons if x.code == "scope_growth")
    assert growth.metric == 0.5
    assert any(x.code == "reopen_trend" and x.metric == 4 for x in r.reasons)
