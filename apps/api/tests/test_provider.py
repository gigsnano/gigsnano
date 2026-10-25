import pytest

from gigsnano_api.bmad.provider import AnthropicProvider, ExtractResult, FakeProvider, TurnDelta


async def collect(provider, **kw):
    deltas, final = [], None
    async for event in provider.stream_turn(**kw):
        if isinstance(event, TurnDelta):
            deltas.append(event.text)
        else:
            final = event
    return deltas, final


async def test_fake_provider_scripted_turns():
    provider = FakeProvider(turns=[("Hello there", False), ("Ready to write.", True)])
    deltas, final = await collect(provider, system=[], messages=[])
    assert "".join(deltas) == "Hello there"
    assert final.proposed_finalize is False
    _, final2 = await collect(provider, system=[], messages=[])
    assert final2.proposed_finalize is True


async def test_fake_provider_scripted_extractions():
    provider = FakeProvider(extractions=[ValueError("bad"), {"title": "T", "markdown": "# T"}])
    with pytest.raises(ValueError):
        await provider.extract(system=[], messages=[], tool_name="emit", schema={})
    out = await provider.extract(system=[], messages=[], tool_name="emit", schema={})
    assert out == ExtractResult(data={"title": "T", "markdown": "# T"}, input_tokens=10, output_tokens=20)


async def test_fake_provider_default_canned_stream():
    provider = FakeProvider()
    deltas, final = await collect(provider, system=[], messages=[])
    assert len("".join(deltas)) > 0
    assert final.proposed_finalize is False


async def test_fake_provider_default_extract_synthesizes_valid_artifact():
    """Keyless dev: an unscripted extract must yield a schema-valid object so
    finalize produces a canned artifact instead of 502ing."""
    from gigsnano_api.bmad.extraction import EXTRACTION_MODELS

    provider = FakeProvider()  # no extractions script → keyless default
    for doc_type, model in EXTRACTION_MODELS.items():
        raw = await provider.extract(
            system=[], messages=[], tool_name="emit_artifact",
            schema=model.model_json_schema(),
        )
        parsed = model.model_validate(raw.data)  # raises if the synthesized shape is invalid
        assert parsed.model_dump().get("markdown")  # every artifact carries markdown body


async def test_fake_provider_scripted_extractions_exhausted_raises():
    provider = FakeProvider(extractions=[{"title": "T", "markdown": "# T"}])
    await provider.extract(system=[], messages=[], tool_name="emit", schema={})
    with pytest.raises(AssertionError):
        await provider.extract(system=[], messages=[], tool_name="emit", schema={})


def test_anthropic_provider_constructs_without_network():
    provider = AnthropicProvider(api_key="test-key", model="claude-sonnet-5")
    assert provider.model == "claude-sonnet-5"


async def test_stream_turn_accepts_model_override():
    provider = FakeProvider(turns=[("Routed reply", False)])
    deltas, final = await collect(provider, system=[], messages=[], model="claude-sonnet-5")
    assert "".join(deltas) == "Routed reply"
    assert final.proposed_finalize is False


def test_anthropic_stream_turn_signature_has_model():
    import inspect

    from gigsnano_api.bmad.provider import AnthropicProvider

    sig = inspect.signature(AnthropicProvider.stream_turn)
    assert "model" in sig.parameters
    assert sig.parameters["model"].default is None


def _fake_message(stop_reason, tool_input, input_tokens=100, output_tokens=50):
    from types import SimpleNamespace

    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="tool_use", name="emit_artifact", input=tool_input)],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


async def test_anthropic_extract_raises_on_max_tokens_truncation():
    """A forced tool call that hits the token ceiling returns partial JSON; extract
    must fail loudly (not return a truncated dict that loops on validation)."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    provider = AnthropicProvider(api_key="k", model="claude-haiku-4-5", max_tokens=4096)
    provider._client = SimpleNamespace(
        messages=SimpleNamespace(
            create=AsyncMock(return_value=_fake_message("max_tokens", {"title": "T"}))
        )
    )
    with pytest.raises(ValueError, match="truncated"):
        await provider.extract(system=[], messages=[], tool_name="emit_artifact", schema={})


async def test_anthropic_extract_returns_input_when_complete():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    provider = AnthropicProvider(api_key="k", model="claude-haiku-4-5")
    provider._client = SimpleNamespace(
        messages=SimpleNamespace(
            create=AsyncMock(
                return_value=_fake_message("tool_use", {"title": "T", "markdown": "# T"})
            )
        )
    )
    out = await provider.extract(system=[], messages=[], tool_name="emit_artifact", schema={})
    assert out == ExtractResult(
        data={"title": "T", "markdown": "# T"},
        input_tokens=100,
        output_tokens=50,
    )
