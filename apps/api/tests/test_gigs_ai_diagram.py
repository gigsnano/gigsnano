"""Task 7 (GIN wiring): GigsAI's system prompt instructs the model to emit a
``gigs:diagram`` block when tracing a connected repo's flow, and the agent's
tool registry merges the work-item tools with the read-only code tools
(Task 6) so the model can actually trace that flow."""

from gigsnano_api.features.gigs_ai.prompt import build_gigs_system


def test_system_prompt_includes_diagram_instruction():
    blocks = build_gigs_system("", agent=None, context_docs=[])
    combined = "\n".join(block["text"] for block in blocks)
    assert "gigs:diagram" in combined


def test_gigs_ai_registry_includes_code_tools():
    # If the router exposes a helper that builds the merged registry, assert names.
    from gigsnano_api.features.gigs_ai.router import build_gigs_ai_registry

    reg = build_gigs_ai_registry()
    for name in ("query_work_items", "code_graph_query", "read_file", "code_grep"):
        assert reg.get(name) is not None
