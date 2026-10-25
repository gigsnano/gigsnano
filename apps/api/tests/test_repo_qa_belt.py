"""Test the repo-qa belt: code + document tools."""

from gigsnano_api.agent.tools.belt import build_repo_context_registry


def test_belt_has_code_and_doc_tools():
    reg = build_repo_context_registry()
    names = {d["name"] for d in reg.anthropic_defs()}
    assert {
        "search_symbols",
        "read_symbol",
        "find_callers",
        "find_callees",
        "trace_path",
        "get_file_tree",
        "calculate_change_impact",
        "find_api_flow",
        "find_related_tests",
        "compare_commits",
        "search_documents",
        "read_document",
        "read_file",
        "code_grep",
    } <= names
