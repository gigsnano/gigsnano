"""Scoring: parse citations from an answer, apply deterministic + LLM-judge checks."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from gigsnano_api.bmad.provider import LLMProvider, RoundDelta
from gigsnano_api.core.config import settings

_CODE_CITE = re.compile(r"\[([^\]:]+):(\d+)-(\d+)\]")
_DOC_CITE = re.compile(r"\[doc:([^\]]+)\]")


@dataclass
class Citations:
    files: set[str] = field(default_factory=set)
    docs: set[str] = field(default_factory=set)


def parse_citations(answer: str) -> Citations:
    files = {m.group(1).strip() for m in _CODE_CITE.finditer(answer)}
    docs = {m.group(1).strip() for m in _DOC_CITE.finditer(answer)}
    return Citations(files=files, docs=docs)


def citations_satisfied(expected_files: list[str], got: Citations) -> bool:
    return all(exp in got.files for exp in expected_files)


# --- LLM judge -------------------------------------------------------------

_JUDGE_SYSTEM = [{
    "type": "text",
    "text": (
        "You are a strict grader for a code-question-answering agent. Given a QUESTION, "
        "the agent's ANSWER, and a RUBRIC, decide how well the answer satisfies the rubric "
        "and is grounded in its citations. Reply with ONLY a JSON object: "
        '{"score": <float 0..1>, "reason": "<one short sentence>"}. No prose, no code fence.'
    ),
}]


@dataclass
class Verdict:
    score: float
    reason: str
    error: bool = False


async def judge(provider: LLMProvider, *, rubric: str, question: str, answer: str) -> Verdict:
    messages = [{
        "role": "user",
        "content": f"QUESTION:\n{question}\n\nANSWER:\n{answer}\n\nRUBRIC:\n{rubric}",
    }]
    text = ""
    async for event in provider.stream_round(system=_JUDGE_SYSTEM, messages=messages, tools=[]):
        if isinstance(event, RoundDelta):
            text += event.text
    raw = text.strip()
    # Tolerate ```json fences / surrounding prose: extract the outer {...} object.
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        raw = raw[start:end + 1]
    try:
        data = json.loads(raw)
        return Verdict(score=float(data["score"]), reason=str(data["reason"]))
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return Verdict(score=0.0, reason=text.strip()[:200], error=True)


# --- cases + combined scoring ---------------------------------------------

@dataclass
class Case:
    id: str
    question: str
    surface: str
    expect_files: list[str]
    expect_tools: list[str]
    rubric: str


@dataclass
class CaseRun:
    answer: str
    tool_calls: list[str]


@dataclass
class CaseResult:
    case_id: str
    passed: bool
    cited_ok: bool
    tools_ok: bool
    verdict: Verdict
    run: CaseRun


def load_cases(path: Path) -> list[Case]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    out: list[Case] = []
    for c in raw.get("cases", []):
        out.append(Case(
            id=c["id"],
            question=c["question"],
            surface=c.get("surface", "gigs_ai"),
            expect_files=list((c.get("expect_citations") or {}).get("files", [])),
            expect_tools=list(c.get("expect_tools", [])),
            rubric=c["rubric"],
        ))
    return out


async def score_case(provider: LLMProvider, case: Case, run: CaseRun) -> CaseResult:
    got = parse_citations(run.answer)
    cited_ok = citations_satisfied(case.expect_files, got)
    tools_ok = all(t in run.tool_calls for t in case.expect_tools)  # soft, non-gating
    verdict = await judge(provider, rubric=case.rubric, question=case.question, answer=run.answer)
    passed = cited_ok and (not verdict.error) and verdict.score >= settings.eval_judge_threshold
    return CaseResult(case.id, passed, cited_ok, tools_ok, verdict, run)
