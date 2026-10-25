"""Analyst triage engine (GIN-214): turn a raw TriageItem into a classified,
deduped, enriched, routed draft. Pure glue over existing seams —
`route_task` (classify + route recommendation), `search_work_items` (grounded
dedupe), and `llm.extract` (enrichment) — so there's no new runtime, just
composition. Human-confirm gate stays in the router (accept/dismiss)."""

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import FakeProvider, LLMProvider
from gigsnano_api.features.intake.schemas import EnrichedDraft
from gigsnano_api.features.search.service import search_work_items
from gigsnano_api.features.task_router.selector import route_task
from gigsnano_api.models.intake import ETriageStatus, TriageItem

# EStoryPriority order, low→high, for max(impact, customer weight).
_PRIORITY_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3, "urgent": 4}
_RANK_PRIORITY = {v: k for k, v in _PRIORITY_RANK.items()}
# Customer priority_weight (0..3) → a floor priority the request can't fall below.
_WEIGHT_FLOOR = {0: "none", 1: "medium", 2: "high", 3: "urgent"}

_ANALYST_SYSTEM = [
    {"type": "text", "text": (
        "You are Mary, the Analyst. Rewrite a raw inbound request into one clean, "
        "actionable work item: a specific title, a concise description with acceptance "
        "criteria, and a priority. Do not invent scope beyond the request."
    )}
]

_MAX_EXTRACT_ATTEMPTS = 3


def combine_priority(impact: str, customer_weight: int) -> str:
    """priority = the higher of the LLM-assessed impact and the customer-weight floor."""
    floor = _WEIGHT_FLOOR.get(customer_weight, "none")
    rank = max(_PRIORITY_RANK.get(impact, 0), _PRIORITY_RANK.get(floor, 0))
    return _RANK_PRIORITY[rank]


async def _enrich(provider: LLMProvider, item: TriageItem) -> tuple[EnrichedDraft, int, int]:
    messages = [{"role": "user", "content": f"{item.title}\n\n{item.body}".strip()}]
    for _ in range(_MAX_EXTRACT_ATTEMPTS):
        result = await provider.extract(
            system=_ANALYST_SYSTEM, messages=messages,
            tool_name="emit_draft", schema=EnrichedDraft.model_json_schema(),
        )
        try:
            draft = EnrichedDraft.model_validate(result.data)
            return draft, result.input_tokens or 0, result.output_tokens or 0
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": "emit_draft was invalid."},
                {"role": "user", "content": f"Failed validation:\n{err}\nEmit again, fixed."},
            ]
    # Fall back to the raw request rather than fail the whole triage.
    return EnrichedDraft(title=item.title[:120], description=item.body or item.title), 0, 0


async def process_triage_item(
    db: AsyncSession, provider: LLMProvider, item: TriageItem, *, customer_weight: int = 0
) -> tuple[TriageItem, int, int, bool]:
    """Classify + dedupe + enrich + prioritize + route. Returns the item plus the
    (input, output) tokens spent and whether the provider was fake (for billing)."""
    text = f"{item.title}\n{item.body}"

    routing = await route_task(db, item.workspace_id, text)

    # Grounded dedupe: title ILIKE over the workspace's work items (cited by number).
    dupes = await search_work_items(db, item.workspace_id, item.title, None)
    item.duplicate_ids = [
        {"story_id": s.id, "story_number": s.story_number, "title": s.title}
        for s in dupes[:5]
    ]

    draft, in_tok, out_tok = await _enrich(provider, item)
    item.enriched_title = draft.title[:300]
    item.enriched_description = draft.description
    item.priority = combine_priority(draft.priority, customer_weight)
    item.classification = {"domain": routing["domain"], "task_type": routing["task_type"]}
    item.recommended_route = routing
    item.status = ETriageStatus.TRIAGED
    await db.flush()
    return item, in_tok, out_tok, isinstance(provider, FakeProvider)
