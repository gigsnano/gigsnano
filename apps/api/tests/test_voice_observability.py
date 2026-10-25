"""Correlation, safe metrics, cost control and release gates (GIN-521/522)."""

import pytest

from gigsnano_api.features.voice.evaluation import (
    GOLDEN,
    REGRESSION_BUDGET,
    CaseResult,
    ECondition,
    EvaluationReport,
    coverage,
    release_gate,
)
from gigsnano_api.features.voice.observability import (
    SLO_FIRST_PARTIAL_MS,
    SLO_READ_RESPONSE_P95_MS,
    CostWindow,
    EOutcome,
    EStage,
    TurnTrace,
    check_slos,
)
from gigsnano_api.voice.commands import ERiskClass, EVoiceIntent


def a_trace():
    trace = TurnTrace(correlation_id="corr-1", session_id="vs_1", workspace="acme")
    trace.record(EStage.PROVIDER_STT, 300)
    trace.record(EStage.RUNTIME, 120)
    trace.record(EStage.POLICY, 5)
    trace.record(EStage.TOOL, 80)
    trace.record(EStage.PROVIDER_TTS, 200)
    return trace


# ── Tracing ──────────────────────────────────────────────────────────────────


def test_one_correlation_id_spans_the_whole_turn():
    assert a_trace().as_metric()["correlation_id"] == "corr-1"


def test_provider_latency_is_separable_from_ours():
    """During an incident the first question is "is it them or us", and a single
    total cannot answer it."""
    trace = a_trace()
    assert trace.provider_ms == 500
    assert trace.gigsnano_ms == 205
    assert trace.total_ms == 705


def test_metrics_carry_no_content():
    metric = a_trace().as_metric()
    assert all(
        isinstance(v, (int, float)) or k in ("correlation_id", "workspace", "outcome")
        for k, v in metric.items()
    )


def test_metric_labels_stay_bounded():
    """A work-item code as a label turns one time series into millions and
    quietly bankrupts the metrics bill this feature was meant to watch."""
    metric = a_trace().as_metric()
    assert set(metric) - {"correlation_id"} == {
        k for k in metric if k.endswith("_ms") or k in ("workspace", "outcome")
    }


def test_outcomes_are_a_closed_set():
    trace = a_trace()
    trace.outcome = EOutcome.DENIED
    assert trace.as_metric()["outcome"] in {e.value for e in EOutcome}


# ── SLOs and cost ────────────────────────────────────────────────────────────


def test_slo_breaches_are_detected():
    breaches = check_slos(
        first_partial_ms=SLO_FIRST_PARTIAL_MS + 1, read_p95_ms=SLO_READ_RESPONSE_P95_MS + 1
    )
    assert {b.name for b in breaches} == {"first_partial_transcript", "read_response_p95"}


def test_meeting_the_slo_raises_nothing():
    assert check_slos(first_partial_ms=200, read_p95_ms=1500) == []


def test_a_spend_cap_reports_exhaustion():
    assert CostWindow(spend=250.0, cap=250.0).exhausted is True


def test_a_spend_spike_is_caught_before_the_cap_is_reached():
    """A cap alone only tells you about runaway spend once the money is gone."""
    window = CostWindow(spend=90.0, cap=250.0)
    assert window.anomalous(baseline_per_day=10.0, days_elapsed=2) is True
    assert window.anomalous(baseline_per_day=10.0, days_elapsed=9) is False


# ── Golden dataset (GIN-522) ─────────────────────────────────────────────────


def test_the_dataset_covers_every_speech_condition():
    covered = {case.condition for case in GOLDEN}
    assert covered == set(ECondition)


def test_the_dataset_covers_reads_writes_clarifications_and_refusals():
    intents = {case.expect_intent for case in GOLDEN}
    assert {
        EVoiceIntent.READ, EVoiceIntent.CREATE, EVoiceIntent.UPDATE,
        EVoiceIntent.COMMENT, EVoiceIntent.UNSUPPORTED,
    } <= intents


def test_adversarial_cases_are_all_marked_must_not_mutate():
    adversarial = [c for c in GOLDEN if c.expect_risk is ERiskClass.HIGH_RISK]
    assert len(adversarial) >= 5
    assert all(c.must_not_mutate for c in adversarial)


def test_prompt_injection_and_cross_tenant_are_in_the_suite():
    ids = {c.id for c in GOLDEN}
    assert {"injection", "cross-tenant", "adversarial-delete"} <= ids


def test_coverage_is_inspectable():
    counts = coverage()
    assert counts["condition:accented"] >= 1
    assert counts["risk:high_risk"] >= 5


def test_fixture_ids_are_stable_and_unique():
    """Failures have to be reproducible from the fixture, which needs the id to
    mean the same thing next run."""
    ids = [c.id for c in GOLDEN]
    assert len(ids) == len(set(ids))


# ── Release gate ─────────────────────────────────────────────────────────────


def passing_report(n=10):
    return EvaluationReport(results=[
        CaseResult(f"c{i}", ECondition.CLEAN, intent_correct=True, entities_correct=True)
        for i in range(n)
    ])


def test_a_clean_run_passes_the_gate():
    assert release_gate(passing_report(), baseline_accuracy=1.0).passed


def test_one_unauthorised_mutation_fails_the_release_outright():
    """Not scored, not budgeted. A budget for unauthorised writes would assert
    that some are acceptable."""
    report = passing_report()
    report.results.append(
        CaseResult("adversarial-delete", ECondition.CLEAN, True, True, unauthorised_mutation=True)
    )
    gate = release_gate(report, baseline_accuracy=0.0)
    assert not gate.passed
    assert "adversarial-delete" in gate.reason


def test_a_confirmation_bypass_also_fails_outright():
    report = passing_report()
    report.results.append(
        CaseResult("create-bug", ECondition.CLEAN, True, True, confirmation_bypassed=True)
    )
    assert not release_gate(report, baseline_accuracy=0.0).passed


def test_safety_outranks_a_perfect_accuracy_score():
    report = EvaluationReport(results=[
        CaseResult("x", ECondition.CLEAN, True, True, unauthorised_mutation=True)
    ])
    assert not release_gate(report, baseline_accuracy=0.0).passed


def test_accuracy_regression_beyond_the_budget_fails():
    report = EvaluationReport(results=[
        CaseResult(f"c{i}", ECondition.CLEAN, intent_correct=i < 5, entities_correct=True)
        for i in range(10)
    ])
    assert report.accuracy == 0.5
    assert not release_gate(report, baseline_accuracy=0.95).passed


def test_a_regression_inside_the_budget_is_tolerated():
    report = EvaluationReport(results=[
        CaseResult(f"c{i}", ECondition.CLEAN, intent_correct=i < 99, entities_correct=True)
        for i in range(100)
    ])
    assert release_gate(report, baseline_accuracy=1.0 - REGRESSION_BUDGET / 2).passed


def test_results_break_down_by_condition():
    """An accent regression hides completely in an overall average."""
    report = EvaluationReport(results=[
        CaseResult("a", ECondition.CLEAN, True, True),
        CaseResult("b", ECondition.ACCENTED, False, True),
    ])
    breakdown = report.by_condition()
    assert breakdown[ECondition.CLEAN] == 1.0
    assert breakdown[ECondition.ACCENTED] == 0.0


def test_failures_are_listed_by_reproducible_id():
    report = EvaluationReport(results=[CaseResult("read-accent", ECondition.ACCENTED, False, True)])
    assert report.failures() == ["read-accent"]
