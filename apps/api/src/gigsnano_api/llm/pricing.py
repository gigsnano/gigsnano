import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-20250514"

# USD per million tokens, from Anthropic's published rates.
#
# An unpriced model bills NOTHING (estimate_cost_usd returns None -> record_llm_usage
# skips the debit), so a gap here is silent free AI, not an error. That is exactly what
# happened: this table knew two models while production was calling three others, so
# 233 of 432 events -- including 209 Opus calls, the most expensive model -- were
# recorded at zero cost. Anything added to `anthropic_model` must be added here too.
MODEL_PRICING: dict[str, dict[str, float]] = {
    DEFAULT_MODEL: {"input_per_m": 3.0, "output_per_m": 15.0},  # Sonnet 4 (legacy)
    "claude-opus-4-8": {"input_per_m": 5.0, "output_per_m": 25.0},
    "claude-opus-4-7": {"input_per_m": 5.0, "output_per_m": 25.0},
    # Sonnet 5 is discounted to $2/$10 through 2026-08-31. Billing the list price is
    # deliberate: it's the durable rate, and under-collecting on expiry is worse than
    # over-collecting by a cent during the promo. Revisit only if the intro is extended.
    "claude-sonnet-5": {"input_per_m": 3.0, "output_per_m": 15.0},
    "claude-sonnet-4-6": {"input_per_m": 3.0, "output_per_m": 15.0},
    # Haiku 4.5 was priced at 0.80/4.00 here -- wrong; the published rate is 1.00/5.00,
    # so every call on the one model that WAS billing under-charged by ~20%.
    "claude-haiku-4-5": {"input_per_m": 1.0, "output_per_m": 5.0},
    # ...and its dated full ID, which the API also returns. Same model, same price:
    # missing it is why 17 Haiku calls billed nothing. Opus 4.8 and Sonnet 5 have no
    # dated variants, so they need no alias row.
    "claude-haiku-4-5-20251001": {"input_per_m": 1.0, "output_per_m": 5.0},
}


def estimate_cost_usd(model: str, *, input_tokens: int, output_tokens: int) -> Decimal | None:
    """USD for one call, or None when `model` isn't priced.

    None means "we don't know what this cost", and callers skip the debit — so an
    unpriced model is free AI that nobody notices. Log it loudly: silence is how this
    went unseen across 233 events.
    """
    rates = MODEL_PRICING.get(model)
    if rates is None:
        logger.error(
            "llm pricing: no rate for model %r — this call is NOT being billed. "
            "Add it to MODEL_PRICING.",
            model,
        )
        return None
    inp = Decimal(input_tokens) / Decimal(1_000_000) * Decimal(str(rates["input_per_m"]))
    out = Decimal(output_tokens) / Decimal(1_000_000) * Decimal(str(rates["output_per_m"]))
    return (inp + out).quantize(Decimal("0.000001"))
