"""Cluster eval failures and ask an LLM to PROPOSE (never apply) a prompt/situation diff."""

from __future__ import annotations

from gigsnano_api.bmad.provider import LLMProvider, RoundDelta
from gigsnano_api.context_engine.eval.scoring import CaseResult

_OPTIMIZER_SYSTEM = [{
    "type": "text",
    "text": (
        "You improve a code-QA agent by editing ONLY two text blocks: its routing INSTRUCTION "
        "and its SITUATION template. Given failure clusters and the current text, propose a "
        "minimal unified diff to those blocks plus a short rationale tying each edit to a "
        "cluster. Do NOT invent tools or change code. Output the diff, then a 'rationale:' line."
    ),
}]


def cluster(results: list[CaseResult]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = {"missing_citation": [], "wrong_route": [], "ungrounded": []}
    for r in results:
        if r.passed:
            continue
        if not r.cited_ok:
            buckets["missing_citation"].append(r.case_id)
        elif not r.tools_ok:
            buckets["wrong_route"].append(r.case_id)
        else:  # cited fine, right tools, but judge low → ungrounded/incorrect
            buckets["ungrounded"].append(r.case_id)
    return buckets


async def propose(
    provider: LLMProvider,
    *,
    failures: dict[str, list[str]],
    instruction_text: str,
    situation_text: str,
) -> str:
    summary = "\n".join(f"- {k}: {v}" for k, v in failures.items() if v)
    messages = [{
        "role": "user",
        "content": (
            f"FAILURE CLUSTERS:\n{summary}\n\n"
            f"CURRENT INSTRUCTION:\n{instruction_text}\n\n"
            f"CURRENT SITUATION TEMPLATE:\n{situation_text}"
        ),
    }]
    text = ""
    async for event in provider.stream_round(system=_OPTIMIZER_SYSTEM, messages=messages, tools=[]):
        if isinstance(event, RoundDelta):
            text += event.text
    return text.strip()
