from gigsnano_api.core.config import settings
from gigsnano_api.llm.pricing import estimate_cost_usd
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, LlmUsageEvent


def usage_event_payload(event: LlmUsageEvent) -> dict:
    """The `data-usage` SSE payload for a call we just recorded (GIN-148).

    Lets a chat stream report what it cost as part of the stream, instead of the
    client following up with a separate fetch to find out.

    `cost_cents` is a float rounded to 4dp, matching `ThreadUsageOut`'s
    convention: the live event and the REST poll describe the same money, so they
    must not disagree about its shape. A fake call has no cost and reports 0.
    """
    return {
        "type": "data-usage",
        "operation": event.operation.value,
        "model": event.model,
        "input_tokens": event.input_tokens,
        "output_tokens": event.output_tokens,
        "total_tokens": event.total_tokens,
        "cost_cents": (
            round(float(event.estimated_cost_usd) * 100, 4)
            if event.estimated_cost_usd is not None
            else 0.0
        ),
    }


async def record_llm_usage(
    db,
    *,
    workspace_id: str,
    user_id: str,
    source: ELlmUsageSource,
    operation: ELlmUsageOperation,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    project_id: str | None = None,
    story_id: str | None = None,
    thread_id: str | None = None,
    is_fake: bool = False,
    debit: bool = True,
) -> LlmUsageEvent:
    """Record one LLM call and, by default, debit the workspace wallet for it.

    `debit=False` records the cost without charging it. Recording and charging are
    separate questions: a system-initiated call (the daily digest's AI note) is real
    money we must be able to see, but charging a user for work they never asked for
    is a product decision, not a billing detail (GIN-147).
    """
    inp = input_tokens or 0
    out = output_tokens or 0
    cost = None if is_fake else estimate_cost_usd(model, input_tokens=inp, output_tokens=out)
    event = LlmUsageEvent(
        workspace_id=workspace_id,
        user_id=user_id,
        source=source,
        operation=operation,
        model=model,
        input_tokens=inp,
        output_tokens=out,
        total_tokens=inp + out,
        estimated_cost_usd=cost,
        project_id=project_id,
        story_id=story_id,
        thread_id=thread_id,
    )
    db.add(event)
    await db.flush()
    if settings.billing_enabled and debit and not is_fake and cost is not None and cost > 0:
        from gigsnano_api.billing import wallet as _wallet
        cents = int(round(float(cost) * 100))
        if cents > 0:
            try:
                await _wallet.debit(db, workspace_id, cents,
                                    ref_type="ai_usage", ref_id=event.id)
            except _wallet.InsufficientBalance:
                # Usage already happened; clamp to available so the wallet never
                # goes negative. (The pre-call guard should prevent reaching here.)
                w = await _wallet.get_or_create_wallet(db, workspace_id)
                if w.available_cents > 0:
                    await _wallet.debit(db, workspace_id, w.available_cents,
                                        ref_type="ai_usage", ref_id=event.id)
    return event
