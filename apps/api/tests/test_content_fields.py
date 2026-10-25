"""GIN-300 — the dual-write / dual-read seam.

Pure logic, no database. The flag matrix is the thing worth pinning: every cell
has to behave, especially the ones that look like failures but aren't.
"""

from __future__ import annotations

import pytest

from gigsnano_api import content
from gigsnano_api.content.fields import (
    build_content,
    divergence_of,
    parse_content_format,
    read_content,
)

_HTML = "<p>hello</p>"
_MD = "## hello\n"


# --- write ------------------------------------------------------------------


def test_flag_off_writes_html_only_and_is_not_an_error() -> None:
    written = build_content(_HTML, content_format="html", write_json=False)
    assert written.html == _HTML
    assert written.json is None
    assert written.error is None
    assert not written.canonical


def test_markdown_write_canonicalises_and_derives_html() -> None:
    written = build_content(_MD, content_format="markdown", write_json=True, source="agent")
    assert written.canonical
    assert written.html == "<h2>hello</h2>"
    assert written.json["schema"] == "gigsnano.doc"
    assert written.json["provenance"]["source"] == "agent"
    assert written.text == "hello"


def test_html_write_stores_html_and_leaves_json_null_without_erroring() -> None:
    """The editor still sends HTML. There is deliberately no HTML -> JSON parser:
    writing one would be a second lossy parser for a format we're demoting. So a
    NULL canonical copy is the correct steady state here, not a failure."""
    written = build_content(_HTML, content_format="html", write_json=True)
    assert written.html == _HTML
    assert written.json is None
    assert written.error is None


def test_json_write_accepts_a_bare_doc_or_a_full_envelope() -> None:
    doc = content.markdown_to_doc(_MD)
    from_doc = build_content(doc, content_format="json", write_json=True)
    from_envelope = build_content(
        content.make_envelope(doc), content_format="json", write_json=True
    )
    assert from_doc.html == from_envelope.html == "<h2>hello</h2>"
    assert from_doc.canonical and from_envelope.canonical


def test_json_write_accepts_a_json_string() -> None:
    import json

    doc = content.markdown_to_doc(_MD)
    written = build_content(json.dumps(doc), content_format="json", write_json=True)
    assert written.html == "<h2>hello</h2>"


def test_a_failed_conversion_clears_the_canonical_copy() -> None:
    """Keeping the old canonical value here would lose the user's edit.

    The HTML column always receives the new value. If the canonical copy stayed
    at the previous value, a reader with content_json_read on would be served the
    OLD text — the edit silently vanishes. NULL falls back to the HTML column,
    which holds exactly what the user just wrote.
    """
    written = build_content("{not json at all", content_format="json", write_json=True)
    assert written.json is None
    assert written.error is not None
    # And the user's save still succeeds — the HTML column is always written.
    assert written.html is not None


def test_an_editor_save_after_an_agent_write_is_not_lost() -> None:
    """The regression that blocked the GIN-305 rollout.

    Agent writes Markdown (canonical stored) -> user edits in the TipTap editor
    (HTML, not canonicalisable) -> reader must see the user's text, not the
    agent's. Found by trying to enable content_json_read, not by review.
    """
    agent_write = build_content("## original", content_format="markdown", write_json=True)
    assert agent_write.canonical

    user_edit = build_content(
        "<p>user edited this</p>", content_format="html", write_json=True
    )
    served = read_content(user_edit.json, user_edit.html, read_json=True)
    assert served.html == "<p>user edited this</p>"
    assert served.origin == "legacy-html"


def test_a_failed_conversion_never_raises() -> None:
    written = build_content({"type": "nonsense"}, content_format="json", write_json=True)
    assert written.error is None or isinstance(written.error, str)


def test_empty_value_writes_empty() -> None:
    for value in ("", None):
        written = build_content(value, content_format="markdown", write_json=True)
        assert written.html == "" and written.json is None


# --- read -------------------------------------------------------------------


def test_read_prefers_canonical_json_when_the_flag_is_on() -> None:
    envelope = content.make_envelope(content.markdown_to_doc(_MD))
    got = read_content(envelope, "<p>stale legacy</p>", read_json=True)
    assert got.origin == "json"
    assert got.html == "<h2>hello</h2>"


def test_read_flag_off_returns_the_legacy_column_byte_for_byte() -> None:
    """The rollback boundary: flipping read off restores prior behaviour exactly,
    with no data movement."""
    envelope = content.make_envelope(content.markdown_to_doc(_MD))
    got = read_content(envelope, "<p>legacy</p>", read_json=False)
    assert got.origin == "legacy-html"
    assert got.html == "<p>legacy</p>"


def test_read_falls_back_when_there_is_no_canonical_copy() -> None:
    got = read_content(None, "<p>legacy</p>", read_json=True)
    assert got.origin == "legacy-html"
    assert got.html == "<p>legacy</p>"


def test_read_of_a_newer_schema_version_falls_back_rather_than_failing() -> None:
    """ADR 0001 s7: a rollback window must not truncate newer documents."""
    envelope = content.make_envelope(content.markdown_to_doc(_MD))
    envelope["version"] = content.SCHEMA_VERSION + 1
    got = read_content(envelope, "<p>legacy</p>", read_json=True)
    assert got.origin == "legacy-html"
    assert got.html == "<p>legacy</p>"
    assert "newer than supported" in (got.error or "")


def test_read_of_corrupt_json_with_no_legacy_is_empty_not_an_exception() -> None:
    got = read_content({"schema": "wrong"}, None, read_json=True)
    assert got.origin == "empty"
    assert got.html == ""
    assert got.error


def test_read_never_sniffs() -> None:
    """A legacy column holding Markdown is returned as-is, not re-interpreted."""
    got = read_content(None, "## not converted", read_json=True)
    assert got.html == "## not converted"


# --- round trip through the seam --------------------------------------------


def test_write_then_read_is_stable() -> None:
    written = build_content(_MD, content_format="markdown", write_json=True)
    got = read_content(written.json, written.html, read_json=True)
    assert got.html == written.html
    assert got.doc == content.markdown_to_doc(_MD)


# --- divergence -------------------------------------------------------------


def test_no_divergence_when_the_columns_agree() -> None:
    written = build_content(_MD, content_format="markdown", write_json=True)
    assert divergence_of("s1", "description", written.json, written.html) is None


def test_divergence_is_reported_when_the_html_column_drifts() -> None:
    written = build_content(_MD, content_format="markdown", write_json=True)
    found = divergence_of("s1", "description", written.json, "<p>hand edited</p>")
    assert found is not None
    assert found.identifier == "s1" and found.field == "description"
    assert found.derived_html == "<h2>hello</h2>"


def test_no_canonical_copy_is_not_divergence() -> None:
    assert divergence_of("s1", "description", None, "<p>anything</p>") is None


def test_unreadable_json_is_a_read_fallback_not_divergence() -> None:
    assert divergence_of("s1", "description", {"schema": "wrong"}, "<p>x</p>") is None


# --- format contract --------------------------------------------------------


@pytest.mark.parametrize("value", ["json", "markdown", "html"])
def test_known_formats_are_accepted(value: str) -> None:
    assert parse_content_format(value, default="html") == value


def test_absent_format_uses_the_call_site_default() -> None:
    assert parse_content_format(None, default="markdown") == "markdown"
    assert parse_content_format(None, default="html") == "html"


def test_an_unknown_format_is_rejected_with_the_valid_set() -> None:
    with pytest.raises(content.ContentError) as excinfo:
        parse_content_format("HTML5", default="html")
    assert "markdown" in str(excinfo.value)


# --- divergence measures meaning, not markup --------------------------------


def test_markup_only_differences_are_not_divergence() -> None:
    """Rendering from a schema *always* changes markup — bare text gains a `<p>`,
    links gain `rel`, attribute order settles. Measuring bytes flagged 65% of
    backfilled prod rows as divergent when 0.5% differed in a single word, which
    is a dashboard nobody can act on."""
    doc = content.markdown_to_doc("Pick the rigor: Quick Flow or Enterprise.\n")
    envelope = content.make_envelope(doc)
    stored_without_wrapper = "Pick the rigor: Quick Flow or Enterprise."
    assert divergence_of("s1", "description", envelope, stored_without_wrapper) is None


def test_a_changed_word_is_divergence() -> None:
    envelope = content.make_envelope(content.markdown_to_doc("the original text"))
    found = divergence_of("s1", "description", envelope, "<p>the tampered text</p>")
    assert found is not None


def test_clearing_a_canonical_column_stores_sql_null_not_json_null() -> None:
    """SQLAlchemy's default writes Python None as the JSON value `null`.

    It reads back identically in Python, so nothing looks wrong — but in SQL the
    two are opposites: `col IS NOT NULL` is TRUE for a JSON null. That made
    rollout coverage count un-canonicalised rows as covered, and made the
    backfill's `WHERE col IS NULL` skip them permanently. Both bugs were invisible
    from Python, which is why this asserts on the type rather than a round trip.
    """
    from gigsnano_api.models.base import JSON_DOC

    from sqlalchemy.dialects import postgresql

    assert JSON_DOC.none_as_null is True
    # And the Postgres variant too — that is the one production actually uses.
    variant = JSON_DOC.dialect_impl(postgresql.dialect())
    assert variant.none_as_null is True
