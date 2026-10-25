"""GIN-335: confidence scoring has inspectable reasons and correct boundaries."""

from gigsnano_api.lib.confidence import (
    ConfidenceSignals,
    EConfidenceLevel,
    score_confidence,
    throughput_cv,
)


def _sig(**kw) -> ConfidenceSignals:
    base = dict(
        completed_samples=20,
        active_periods=8,
        history_periods=12,
        throughput_cv=0.2,
        scope_churn=0.05,
        approximate_share=0.0,
    )
    base.update(kw)
    return ConfidenceSignals(**base)


def test_no_completions_is_no_data():
    r = score_confidence(_sig(completed_samples=0))
    assert r.level == EConfidenceLevel.NO_DATA
    assert r.reasons == ("no_completions",)


def test_few_completions_capped_low():
    r = score_confidence(_sig(completed_samples=3))
    assert r.level == EConfidenceLevel.LOW
    assert "insufficient_completions" in r.reasons


def test_medium_history_capped_medium():
    r = score_confidence(_sig(completed_samples=8))
    assert r.level == EConfidenceLevel.MEDIUM
    assert "limited_history" in r.reasons


def test_ample_clean_data_is_high_with_no_reasons():
    r = score_confidence(_sig(completed_samples=30))
    assert r.level == EConfidenceLevel.HIGH
    assert r.reasons == ()


def test_high_volatility_downgrades_with_reason():
    r = score_confidence(_sig(completed_samples=30, throughput_cv=1.5))
    assert r.level == EConfidenceLevel.MEDIUM
    assert "high_volatility" in r.reasons


def test_unstable_scope_downgrades():
    r = score_confidence(_sig(completed_samples=30, scope_churn=0.5))
    assert r.level == EConfidenceLevel.MEDIUM
    assert "unstable_scope" in r.reasons


def test_approximate_history_downgrades():
    r = score_confidence(_sig(completed_samples=30, approximate_share=0.9))
    assert "approximate_history" in r.reasons
    assert r.level == EConfidenceLevel.MEDIUM


def test_multiple_adverse_signals_floor_at_low():
    r = score_confidence(
        _sig(completed_samples=30, throughput_cv=2.0, scope_churn=0.9, approximate_share=0.9, active_periods=1)
    )
    assert r.level == EConfidenceLevel.LOW  # floored, never NO_DATA when data exists
    for code in ("high_volatility", "unstable_scope", "approximate_history", "sparse_history"):
        assert code in r.reasons


def test_confidence_below_high_always_has_reasons():
    for c in (0, 3, 8):
        assert score_confidence(_sig(completed_samples=c)).reasons  # non-empty


def test_throughput_cv_zero_for_constant_series():
    assert throughput_cv([4, 4, 4, 4]) == 0.0
    assert throughput_cv([5]) == 0.0
    assert throughput_cv([0, 8, 0, 8]) > 0.0
