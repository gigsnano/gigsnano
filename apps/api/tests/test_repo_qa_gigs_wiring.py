from gigsnano_api.agent.tools.instructions import REPO_CONTEXT_INSTRUCTION
from gigsnano_api.features.gigs_ai.prompt import build_gigs_system
from gigsnano_api.features.gigs_ai.router import build_gigs_ai_registry


def test_gigs_registry_includes_belt():
    names = {d["name"] for d in build_gigs_ai_registry().anthropic_defs()}
    assert {"find_callers", "trace_path", "search_documents"} <= names
    assert {"query_work_items", "create_work_item"} <= names  # work-item tools preserved


def test_gigs_system_includes_routing_instruction():
    blocks = build_gigs_system("Situation: workspace \"Acme\"")
    text = " ".join(b["text"] for b in blocks)
    assert "find_callers" in text or "code navigation" in text.lower()
    assert REPO_CONTEXT_INSTRUCTION.split("\n")[0] in text
