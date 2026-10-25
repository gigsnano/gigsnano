"""GIN-302 — the round-trip and safety invariants of the content conversion library.

Pure logic: no database, no app fixtures. Run with

    uv run pytest tests/test_content_roundtrip.py
"""

from __future__ import annotations

import pytest

from gigsnano_api import content
from gigsnano_api.content.schema import SCHEMA_VERSION

from .fixtures.content import cases


# --- round-trip invariants ---------------------------------------------------


@pytest.mark.parametrize("name", sorted(cases.ROUND_TRIP))
def test_markdown_round_trip_is_a_fixed_point(name: str) -> None:
    """markdown -> JSON -> markdown returns the input unchanged."""
    source = cases.ROUND_TRIP[name]
    assert content.doc_to_markdown(content.markdown_to_doc(source)) == source


@pytest.mark.parametrize("name", sorted(cases.NORMALISING))
def test_normalising_inputs_reach_a_fixed_point(name: str) -> None:
    """The first pass may rewrite; the second must not."""
    source, expected = cases.NORMALISING[name]
    once = content.doc_to_markdown(content.markdown_to_doc(source))
    assert once == expected
    assert content.doc_to_markdown(content.markdown_to_doc(once)) == expected


@pytest.mark.parametrize("name", sorted(cases.ROUND_TRIP))
def test_json_round_trip_is_lossless(name: str) -> None:
    """JSON -> markdown -> JSON preserves every node, attribute and mark."""
    doc = content.markdown_to_doc(cases.ROUND_TRIP[name])
    assert content.markdown_to_doc(content.doc_to_markdown(doc)) == doc


# --- semantic references keep their identity ---------------------------------


def test_mention_keeps_id_and_fallback() -> None:
    doc = content.markdown_to_doc(cases.MENTION)
    mention = _find(doc, "mention")
    assert mention["attrs"]["entityId"] == "9f18ddde-24ec-4aa2-ab79-a3e25d1ba88c"
    assert mention["attrs"]["entityType"] == "user"
    assert mention["attrs"]["label"] == "Jessy"


def test_team_mention_carries_its_kind() -> None:
    doc = content.markdown_to_doc(cases.TEAM_MENTION)
    assert _find(doc, "mention")["attrs"]["entityType"] == "team"


def test_work_item_ref_keeps_id_and_code() -> None:
    doc = content.markdown_to_doc(cases.WORK_ITEM_REF)
    ref = _find(doc, "workItemRef")
    assert ref["attrs"]["workItemId"] == "34db40fe-7bd2-42ba-9ddd-8f11aaf3caec"
    assert ref["attrs"]["code"] == "GIN-297"


def test_attachment_keeps_file_id() -> None:
    doc = content.markdown_to_doc(cases.ATTACHMENT)
    assert _find(doc, "attachment")["attrs"]["fileId"].startswith("aaaabbbb")


def test_internal_image_resolves_to_a_file_id_not_a_url() -> None:
    doc = content.markdown_to_doc(cases.INTERNAL_IMAGE)
    image = _find(doc, "image")
    assert image["attrs"]["fileId"] == "99998888-7777-6666-5555-444433332222"
    assert image["attrs"]["src"] is None
    assert image["attrs"]["alt"] == "architecture diagram"


def test_a_deleted_target_still_round_trips() -> None:
    """An unresolved reference must never degrade to plain text (ADR 0001 s4.1)."""
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "workItemRef",
                            "attrs": {"workItemId": "gone", "code": "GIN-999"},
                        }
                    ],
                }
            ],
        }
    )
    assert content.markdown_to_doc(content.doc_to_markdown(doc)) == doc
    assert "GIN-999" in content.doc_to_text(doc)


# --- the bugs that motivated the epic ----------------------------------------


def test_code_spans_containing_tags_are_never_treated_as_html() -> None:
    """GIN-134 root cause 2."""
    doc = content.markdown_to_doc(cases.CODE_CONTAINING_HTML)
    text = content.doc_to_text(doc)
    assert "<p>" in text and "##" not in text
    assert _find(doc, "codeBlock")["attrs"]["language"] == "html"


def test_markdown_headings_never_survive_as_literal_hashes() -> None:
    """GIN-117 / GIN-134 symptom: `##` visible in the rendered output."""
    html = content.doc_to_html(content.markdown_to_doc("## Real heading\n"))
    assert html == "<h2>Real heading</h2>"


def test_task_checked_state_persists() -> None:
    """GIN-78."""
    doc = content.markdown_to_doc(cases.TASK_LISTS)
    checked = [
        n["attrs"]["checked"] for n in _find_all(doc, "taskItem")
    ]
    assert checked == [False, True, False]
    assert 'data-checked="true"' in content.doc_to_html(doc)


def test_mermaid_is_stored_as_source_never_svg() -> None:
    """GIN-41: the document holds the diagram source; SVG is a render artifact."""
    doc = content.markdown_to_doc(cases.MERMAID)
    block = _find(doc, "codeBlock")
    assert block["attrs"]["language"] == "mermaid"
    assert "graph TD" in block["content"][0]["text"]
    assert "<svg" not in content.doc_to_html(doc)


def test_gfm_tables_are_not_a_paragraph_of_pipes() -> None:
    """The gap markdown_to_html left open (markdown_html.py:68-122)."""
    doc = content.markdown_to_doc(cases.TABLE)
    assert _find(doc, "table") is not None
    assert len(_find_all(doc, "tableHeader")) == 2
    assert "<table>" in content.doc_to_html(doc)


# --- security ----------------------------------------------------------------


@pytest.mark.parametrize(
    "href",
    [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "java\tscript:alert(1)",
        " javascript:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
    ],
)
def test_hostile_link_schemes_are_stripped_but_text_survives(href: str) -> None:
    """Via Markdown. Some of these markdown-it refuses to linkify at all, leaving
    the whole construct as escaped literal text; either way no anchor is emitted."""
    html = content.doc_to_html(content.markdown_to_doc(f"[click me]({href})"))
    assert "click me" in html
    assert "<a" not in html and "href" not in html


@pytest.mark.parametrize(
    "href", ["javascript:alert(1)", "data:text/html,<script>", "vbscript:x"]
)
def test_hostile_link_schemes_are_stripped_when_posted_as_json(href: str) -> None:
    """The real attack surface: an agent PUTs canonical JSON directly, so the
    allow-list has to hold without markdown-it in front of it."""
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "click me",
                            "marks": [{"type": "link", "attrs": {"href": href}}],
                        }
                    ],
                }
            ],
        }
    )
    html = content.doc_to_html(doc)
    assert "click me" in html
    assert "<a" not in html and "href" not in html


@pytest.mark.parametrize(
    "href", ["https://example.com", "http://example.com", "mailto:a@b.com", "/relative"]
)
def test_safe_link_schemes_survive(href: str) -> None:
    assert content.link_scheme_ok(href)


def test_html_in_markdown_is_literal_text_not_markup() -> None:
    doc = content.markdown_to_doc("<script>alert(1)</script>\n")
    html = content.doc_to_html(doc)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_rendered_links_force_noopener() -> None:
    html = content.doc_to_html(content.markdown_to_doc("[x](https://example.com)"))
    assert 'rel="noopener noreferrer nofollow"' in html


def test_validation_strips_undeclared_attributes() -> None:
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "attrs": {"textAlign": "center", "onclick": "steal()"},
                    "content": [{"type": "text", "text": "hi"}],
                }
            ],
        }
    )
    assert doc["content"][0]["attrs"] == {"textAlign": "center"}


def test_image_src_with_a_hostile_scheme_is_dropped() -> None:
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "image",
                            "attrs": {"src": "javascript:alert(1)", "fileId": None},
                        }
                    ],
                }
            ],
        }
    )
    assert doc["content"][0]["content"][0]["attrs"]["src"] is None


# --- unknown content is preserved, not destroyed -----------------------------


def test_unknown_node_is_preserved_rather_than_dropped() -> None:
    """ADR 0001 s4.3 — this is what makes additive schema changes non-breaking."""
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [{"type": "futureWidget", "attrs": {"payload": "keep me"}}],
        }
    )
    node = doc["content"][0]
    assert node["type"] == "unknownBlock"
    assert node["attrs"]["originalType"] == "futureWidget"
    assert "keep me" in node["attrs"]["raw"]


def test_unknown_node_survives_a_markdown_round_trip() -> None:
    doc = content.validate_doc(
        {"type": "doc", "content": [{"type": "futureWidget", "attrs": {"a": 1}}]}
    )
    assert content.markdown_to_doc(content.doc_to_markdown(doc)) == doc


def test_unknown_mark_is_preserved() -> None:
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "hi", "marks": [{"type": "sparkle"}]}
                    ],
                }
            ],
        }
    )
    mark = doc["content"][0]["content"][0]["marks"][0]
    assert mark["type"] == "unknownMark"
    assert mark["attrs"]["originalType"] == "sparkle"


# --- envelope and versioning -------------------------------------------------


def test_envelope_carries_version_and_provenance() -> None:
    envelope = content.make_envelope(content.markdown_to_doc("hi"), source="agent")
    assert envelope["schema"] == "gigsnano.doc"
    assert envelope["version"] == SCHEMA_VERSION
    assert envelope["provenance"]["source"] == "agent"
    assert content.parse_envelope(envelope) == content.markdown_to_doc("hi")


def test_migration_provenance_is_stamped_only_when_migrating() -> None:
    native = content.make_envelope(content.empty_doc())
    assert "migrated_at" not in native["provenance"]

    migrated = content.make_envelope(
        content.empty_doc(), source="html-backfill", migrated_from="html", migrator="gin-308@1"
    )
    assert migrated["provenance"]["migrated_from"] == "html"
    assert migrated["provenance"]["migrated_at"]


def test_a_newer_schema_version_is_refused_rather_than_guessed() -> None:
    envelope = content.make_envelope(content.empty_doc())
    envelope["version"] = SCHEMA_VERSION + 1
    with pytest.raises(content.ContentError, match="newer than supported"):
        content.parse_envelope(envelope)


def test_unknown_schema_is_refused() -> None:
    with pytest.raises(content.ContentError):
        content.parse_envelope({"schema": "something.else", "version": 1, "doc": {}})


# --- derived projections -----------------------------------------------------


def test_text_projection_carries_reference_fallbacks() -> None:
    """Searching for a mention label or a work-item code must find the document."""
    doc = content.markdown_to_doc(cases.MENTION + "\n" + cases.WORK_ITEM_REF)
    text = content.doc_to_text(doc)
    assert "@Jessy" in text
    assert "GIN-297" in text
    assert "gigsnano:" not in text


def test_text_projection_contains_no_markup() -> None:
    doc = content.markdown_to_doc(cases.HEADINGS + cases.MARKS + cases.TABLE)
    text = content.doc_to_text(doc)
    assert "<" not in text and "**" not in text and "#" not in text


def test_empty_document_renders_as_the_editors_empty_value() -> None:
    assert content.doc_to_html(content.empty_doc()) == "<p></p>"
    assert content.doc_to_markdown(content.empty_doc()) == ""
    assert content.is_empty(content.empty_doc())


def test_a_document_holding_only_an_atom_is_not_empty() -> None:
    doc = content.markdown_to_doc(cases.INTERNAL_IMAGE)
    assert not content.is_empty(doc)


def test_underline_is_documented_lossy_on_markdown_export() -> None:
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "under", "marks": [{"type": "underline"}]}
                ],
            }
        ],
    }
    assert content.doc_to_markdown(doc).strip() == "under"
    assert "<u>under</u>" in content.doc_to_html(doc)


# --- structural failures are rejected, not silently accepted ------------------


def test_a_node_without_a_type_is_rejected() -> None:
    with pytest.raises(content.ContentError, match="missing its type"):
        content.validate_doc({"type": "doc", "content": [{"attrs": {}}]})


def test_an_empty_text_node_is_rejected() -> None:
    with pytest.raises(content.ContentError):
        content.validate_doc({"type": "doc", "content": [{"type": "text", "text": ""}]})


def test_content_error_reports_where() -> None:
    with pytest.raises(content.ContentError) as excinfo:
        content.validate_doc({"type": "doc", "content": [{"type": "text"}]})
    assert "doc.content[0]" in str(excinfo.value)


# --- helpers -----------------------------------------------------------------


def _find(node: dict, node_type: str) -> dict | None:
    if node.get("type") == node_type:
        return node
    for child in node.get("content") or []:
        found = _find(child, node_type)
        if found is not None:
            return found
    return None


def _find_all(node: dict, node_type: str) -> list[dict]:
    out = [node] if node.get("type") == node_type else []
    for child in node.get("content") or []:
        out.extend(_find_all(child, node_type))
    return out
