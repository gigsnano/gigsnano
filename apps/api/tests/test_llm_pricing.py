from decimal import Decimal

from gigsnano_api.llm.pricing import DEFAULT_MODEL, estimate_cost_usd


def test_estimate_cost_sonnet():
    cost = estimate_cost_usd(DEFAULT_MODEL, input_tokens=1_000_000, output_tokens=100_000)
    assert cost == Decimal("4.500000")  # 3.0 + 1.5


def test_estimate_cost_unknown_model_returns_none():
    assert estimate_cost_usd("unknown-model", input_tokens=100, output_tokens=100) is None


def test_estimate_cost_zero_tokens():
    cost = estimate_cost_usd(DEFAULT_MODEL, input_tokens=0, output_tokens=0)
    assert cost == Decimal("0")


def test_configured_model_is_priced():
    """The gap that cost real money: `anthropic_model` pointed at a model this table
    didn't know, so estimate_cost_usd returned None and every call billed nothing --
    silently. If someone repoints the setting, this fails instead of going free."""
    from gigsnano_api.core.config import settings
    from gigsnano_api.llm.pricing import MODEL_PRICING

    assert settings.anthropic_model in MODEL_PRICING, (
        f"{settings.anthropic_model!r} is not priced — calls would not be billed"
    )


def test_models_seen_in_production_are_priced():
    """Every model observed in prod's llm_usage_events on 2026-07-17. 233 of 432 events
    had no cost because these were missing."""
    from gigsnano_api.llm.pricing import MODEL_PRICING

    for model in [
        "claude-opus-4-8",
        "claude-sonnet-5",
        "claude-haiku-4-5",
        "claude-haiku-4-5-20251001",  # the dated full ID — same model, distinct key
    ]:
        assert model in MODEL_PRICING, f"{model!r} unpriced — seen in prod"


def test_haiku_dated_alias_matches_its_undated_id():
    """claude-haiku-4-5-20251001 IS claude-haiku-4-5; the prices must not drift apart."""
    from gigsnano_api.llm.pricing import MODEL_PRICING

    assert MODEL_PRICING["claude-haiku-4-5"] == MODEL_PRICING["claude-haiku-4-5-20251001"]


def test_published_rates():
    """Anchored to Anthropic's published per-MTok rates. Haiku was 0.80/4.00 here, which
    under-charged ~20% on the one model that was billing."""
    # Opus 4.8: $5 in / $25 out
    assert estimate_cost_usd("claude-opus-4-8", input_tokens=1_000_000, output_tokens=0) == Decimal("5.000000")
    assert estimate_cost_usd("claude-opus-4-8", input_tokens=0, output_tokens=1_000_000) == Decimal("25.000000")
    # Haiku 4.5: $1 in / $5 out
    assert estimate_cost_usd("claude-haiku-4-5", input_tokens=1_000_000, output_tokens=0) == Decimal("1.000000")
    assert estimate_cost_usd("claude-haiku-4-5", input_tokens=0, output_tokens=1_000_000) == Decimal("5.000000")
    # Sonnet 5: list price $3 in / $15 out (not the $2/$10 intro)
    assert estimate_cost_usd("claude-sonnet-5", input_tokens=1_000_000, output_tokens=0) == Decimal("3.000000")


def test_unpriced_model_is_logged_not_silent(caplog):
    """None means 'not billed'. It must never be quiet."""
    import logging

    with caplog.at_level(logging.ERROR):
        assert estimate_cost_usd("claude-not-a-real-model", input_tokens=1, output_tokens=1) is None
    assert "NOT being billed" in caplog.text
