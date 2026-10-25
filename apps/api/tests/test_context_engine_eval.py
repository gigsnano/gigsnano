"""Hermetic unit tests for the Context Engine SP5+SP6 eval loop.

Live paths (FalkorDB index, real provider) are exercised by the manual CLI run
(plan Task 8), not here. These tests use FakeProvider + pure functions only.
"""

from __future__ import annotations

import pytest

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.context_engine.eval.optimize import cluster, propose
from gigsnano_api.context_engine.eval.scoring import (
    Case,
    CaseResult,
    CaseRun,
    Verdict,
    citations_satisfied,
    judge,
    parse_citations,
    score_case,
)
from gigsnano_api.core.config import settings


def _fake(text: str) -> FakeProvider:
    """FakeProvider scripted to emit `text` from one stream_round call."""
    return FakeProvider(turns=[(text, False)])


def test_eval_settings_defaults():
    assert settings.eval_judge_threshold == 0.7
    assert isinstance(settings.eval_target_repo_path, str)
    assert isinstance(settings.eval_target_sha, str)
    assert settings.eval_judge_model  # non-empty


# --- Task 2: citation parsing + deterministic check ------------------------

def test_parse_citations_extracts_files_and_docs():
    answer = (
        "Sign-in calls [src/services/auth.service.ts:10-40] and "
        "also [src/services/auth.service.ts:55-60]; see [doc:Architecture]."
    )
    c = parse_citations(answer)
    assert c.files == {"src/services/auth.service.ts"}  # deduped to file granularity
    assert c.docs == {"Architecture"}


def test_citations_satisfied_requires_all_expected():
    c = parse_citations("[a/b.ts:1-2] [c/d.ts:3-4]")
    assert citations_satisfied(["a/b.ts"], c) is True
    assert citations_satisfied(["a/b.ts", "c/d.ts"], c) is True
    assert citations_satisfied(["a/b.ts", "missing.ts"], c) is False


# --- Task 3: LLM judge -----------------------------------------------------

@pytest.mark.asyncio
async def test_judge_parses_json_verdict():
    provider = _fake('{"score": 0.9, "reason": "grounded and correct"}')
    v = await judge(provider, rubric="must mention X", question="q?", answer="a [f.ts:1-2]")
    assert v.error is False
    assert v.score == 0.9
    assert "grounded" in v.reason


@pytest.mark.asyncio
async def test_judge_tolerates_markdown_fenced_json():
    provider = _fake('```json\n{"score": 0.95, "reason": "great"}\n```')
    v = await judge(provider, rubric="r", question="q", answer="a")
    assert v.error is False
    assert v.score == 0.95


@pytest.mark.asyncio
async def test_judge_marks_unparseable_as_error():
    provider = _fake("not json at all")
    v = await judge(provider, rubric="r", question="q", answer="a")
    assert v.error is True
    assert v.score == 0.0


# --- Task 4: combined score_case -------------------------------------------

def _case(**kw) -> Case:
    base = dict(id="c1", question="q", surface="gigs_ai",
                expect_files=["a/b.ts"], expect_tools=["search_symbols"], rubric="r")
    base.update(kw)
    return Case(**base)


@pytest.mark.asyncio
async def test_score_case_pass_when_cited_and_judge_high():
    provider = _fake('{"score": 0.8, "reason": "ok"}')
    run = CaseRun(answer="see [a/b.ts:1-9]", tool_calls=["search_symbols"])
    res = await score_case(provider, _case(), run)
    assert res.cited_ok and res.tools_ok
    assert res.passed is True


@pytest.mark.asyncio
async def test_score_case_fail_when_missing_citation():
    provider = _fake('{"score": 0.9, "reason": "ok"}')
    run = CaseRun(answer="no citation here", tool_calls=[])
    res = await score_case(provider, _case(), run)
    assert res.cited_ok is False
    assert res.passed is False  # citation gate fails regardless of judge


@pytest.mark.asyncio
async def test_score_case_fail_when_judge_below_threshold():
    provider = _fake('{"score": 0.5, "reason": "weak"}')
    run = CaseRun(answer="see [a/b.ts:1-9]", tool_calls=["search_symbols"])
    res = await score_case(provider, _case(), run)
    assert res.cited_ok is True
    assert res.passed is False


# --- Task 5: failure clustering + optimizer --------------------------------

def _fail(cid: str, cited_ok: bool, tools_ok: bool, verdict_score: float) -> CaseResult:
    return CaseResult(cid, passed=False, cited_ok=cited_ok, tools_ok=tools_ok,
                      verdict=Verdict(verdict_score, "r"), run=CaseRun("ans", []))


def test_cluster_buckets_by_failure_type():
    results = [
        _fail("miss", cited_ok=False, tools_ok=True, verdict_score=0.9),   # missing_citation
        _fail("route", cited_ok=True, tools_ok=False, verdict_score=0.9),  # wrong_route
        _fail("ungr", cited_ok=True, tools_ok=True, verdict_score=0.2),    # ungrounded
    ]
    buckets = cluster(results)
    assert buckets["missing_citation"] == ["miss"]
    assert buckets["wrong_route"] == ["route"]
    assert buckets["ungrounded"] == ["ungr"]


@pytest.mark.asyncio
async def test_propose_returns_nonempty_proposal():
    provider = _fake("--- a/instructions\n+++ b/instructions\n@@ tweak @@\nrationale: fix routing")
    text = await propose(provider, failures={"wrong_route": ["route"]},
                         instruction_text="INSTR", situation_text="SIT")
    assert "rationale" in text.lower()


# --- Task 6: run_case capture (stack-free via monkeypatched run_agent) ------

@pytest.mark.asyncio
async def test_run_case_accumulates_text_and_tool_calls(monkeypatch):
    from gigsnano_api.agent.runner import AgentText, AgentToolCall
    from gigsnano_api.context_engine.eval import harness

    async def fake_run_agent(*args, **kwargs):
        yield AgentToolCall("t1", "search_symbols", {})
        yield AgentText("The answer ")
        yield AgentText("[a/b.ts:1-9].")

    monkeypatch.setattr(harness, "run_agent", fake_run_agent)
    run = await harness.run_case(
        provider=object(), registry=object(), ctx=object(),
        question="q", situation_text="SIT",
    )
    assert run.answer == "The answer [a/b.ts:1-9]."
    assert run.tool_calls == ["search_symbols"]


# --- Task 8: shipped dataset is well-formed --------------------------------

def test_shipped_dataset_loads_and_is_wellformed():
    from pathlib import Path

    from gigsnano_api.context_engine.eval import harness
    from gigsnano_api.context_engine.eval.scoring import load_cases

    path = Path(harness.__file__).with_name("dataset.yaml")
    cases = load_cases(path)
    assert len(cases) >= 10
    ids = [c.id for c in cases]
    assert len(ids) == len(set(ids))  # unique ids
    for c in cases:
        assert c.expect_files, f"case {c.id} must cite at least one file"
        assert c.rubric.strip(), f"case {c.id} needs a rubric"
        assert c.surface in {"gigs_ai", "bmad_story"}
