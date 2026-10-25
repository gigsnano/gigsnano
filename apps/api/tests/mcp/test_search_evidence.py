"""Pure-function tests for MCP search relevance evidence (GIN-365)."""

from gigsnano_api.mcp_server.tools import _match_evidence, _plain


def _story(code=None, title="", description=""):
    return {"code": code, "title": title, "description": description}


def test_exact_code_scores_highest_and_flags_code():
    ev = _match_evidence("GIN-309", _story(code="GIN-309", title="Anything"))
    assert ev["relevance_score"] == 1.0
    assert "code" in ev["matched_fields"]


def test_exact_title_outranks_description_only():
    exact = _match_evidence("Inbox", _story(title="Inbox"))
    desc = _match_evidence("Inbox", _story(title="Ordinary", description="<p>the inbox</p>"))
    assert exact["relevance_score"] > desc["relevance_score"]
    assert exact["matched_fields"] == ["title"]
    assert desc["matched_fields"] == ["description"]


def test_highlight_is_sanitized_plain_text():
    ev = _match_evidence("quokka", _story(title="Task", description="<p>needs a <b>quokka</b> review</p>"))
    assert ev["highlight"] and "<" not in ev["highlight"]
    assert "quokka" in ev["highlight"].lower()


def test_plain_strips_tags():
    assert _plain("<p>hello <b>world</b></p>") == "hello  world"


def test_no_match_scores_low_and_empty_fields():
    ev = _match_evidence("zzz", _story(code="GIN-1", title="unrelated", description="none"))
    assert ev["matched_fields"] == []
    assert ev["relevance_score"] == 0.2
