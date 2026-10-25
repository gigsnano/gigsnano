"""Grounded talent matching (GIN-186): rank AI coding-agents (personas) and
human freelancers for a work item, blending the router's classification with
freelancer skills. The agent candidate is the router's best-fit persona; humans
are scored by skill overlap with the task's domain/type/title terms.

ponytail: named ceiling — deeper Context-Engine signals (the item's touched
files/languages via GIN-200 impact) would sharpen the human ranking; today the
grounded signal is the router's domain/type classification."""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.task_router.selector import route_task
from gigsnano_api.models.talent import Freelancer

_CONFIDENCE_SCORE = {"high": 90, "medium": 60, "low": 40}


def _terms(domain: str, task_type: str, title: str) -> set[str]:
    terms = {domain, task_type} | set(re.findall(r"[a-z]{4,}", title.lower()))
    terms.discard("general")
    return terms


async def match_candidates(db: AsyncSession, workspace_id: str, story, limit: int = 6) -> list[dict]:
    text = f"{story.title}\n{story.description or ''}"
    routing = await route_task(db, workspace_id, text)

    candidates: list[dict] = [
        {
            "type": "agent",
            "id": routing["persona_id"],
            "name": routing["persona_name"],
            "score": _CONFIDENCE_SCORE.get(routing["confidence"], 40),
            "reason": routing["rationale"],
            "est_rate": None,
        }
    ]

    terms = _terms(routing["domain"], routing["task_type"], story.title)
    for f in (await db.execute(select(Freelancer))).scalars().all():
        matched = sorted({s for s in f.skills if any(t in s.lower() for t in terms)})
        score = len(matched) * 20 + f.job_success_pct // 5 + (10 if f.available_now else 0)
        candidates.append({
            "type": "human",
            "id": f.id,
            "name": f.name,
            "score": score,
            "reason": ("skills: " + ", ".join(matched)) if matched else "general availability",
            "est_rate": f.hourly_rate,
        })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates[:limit]
