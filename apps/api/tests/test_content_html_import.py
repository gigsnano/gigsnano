"""GIN-308 — legacy HTML -> canonical JSON, and the backfill's safety rules.

The load-bearing property is not "conversion is pretty", it is **conversion never
loses what the document says**. Most of these tests are about that.
"""

from __future__ import annotations

import pytest

from gigsnano_api import content
from gigsnano_api.content.backfill import Report, verify
from gigsnano_api.content.html_import import html_to_doc


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


# --- our own output round-trips ----------------------------------------------
#
# The backfill's real input is HTML this codebase generated, so that is the case
# that has to be exact.


@pytest.mark.parametrize(
    "markdown",
    [
        "# Heading\n",
        "Plain **bold** and *italic* and ~~struck~~ and `code`.\n",
        "- one\n- two\n  - nested\n",
        "1. first\n2. second\n",
        "- [x] done\n- [ ] todo\n",
        "> quoted\n",
        "```python\nx = 1\n```\n",
        "```mermaid\ngraph TD\n  A --> B\n```\n",
        "| a | b |\n| --- | --- |\n| 1 | 2 |\n",
        "---\n",
        "[link](https://example.com)\n",
        "Assigning [@Jessy](gigsnano:user/9f18ddde-1111-2222-3333-444444444444).\n",
        "![alt](https://img.test/x.png)\n",
    ],
)
def test_round_trips_html_this_codebase_generated(markdown: str) -> None:
    original = content.markdown_to_doc(markdown)
    html = content.doc_to_html(original)
    assert html_to_doc(html) == original


# --- structure ---------------------------------------------------------------


def test_headings_and_paragraphs() -> None:
    doc = html_to_doc("<h2>Title</h2><p>Body text.</p>")
    assert _find(doc, "heading")["attrs"]["level"] == 2
    assert content.doc_to_text(doc) == "Title\nBody text."


def test_task_checked_state_survives() -> None:
    html = (
        '<ul data-type="taskList">'
        '<li data-type="taskItem" data-checked="true"><label>'
        '<input type="checkbox" checked></label><div><p>done</p></div></li>'
        '<li data-type="taskItem" data-checked="false"><label>'
        '<input type="checkbox"></label><div><p>todo</p></div></li></ul>'
    )
    doc = html_to_doc(html)
    assert [t["attrs"]["checked"] for t in _find_all(doc, "taskItem")] == [True, False]


def test_mention_keeps_its_id_and_label() -> None:
    html = (
        '<p>Hi <mention-component id="u1" entity_identifier="u1" '
        'entity_name="user_mention">Jessy</mention-component></p>'
    )
    mention = _find(html_to_doc(html), "mention")
    assert mention["attrs"]["entityId"] == "u1"
    assert mention["attrs"]["label"] == "Jessy"
    assert mention["attrs"]["entityType"] == "user"


def test_code_block_language_is_recovered() -> None:
    doc = html_to_doc('<pre><code class="language-mermaid">graph TD</code></pre>')
    block = _find(doc, "codeBlock")
    assert block["attrs"]["language"] == "mermaid"
    assert block["content"][0]["text"] == "graph TD"


def test_inline_code_is_a_mark_not_a_block() -> None:
    doc = html_to_doc("<p>Use <code>&lt;p&gt;</code> here.</p>")
    assert _find(doc, "codeBlock") is None
    assert "<p>" in content.doc_to_text(doc)


def test_presentational_tags_are_understood() -> None:
    """Legacy content uses <b>/<i>, not just <strong>/<em>."""
    doc = html_to_doc("<p><b>bold</b> and <i>italic</i></p>")
    marks = {m["type"] for n in _find_all(doc, "text") for m in n.get("marks", [])}
    assert marks == {"bold", "italic"}


# --- tolerance for markup that isn't ours ------------------------------------


def test_unknown_tags_are_unwrapped_not_dropped() -> None:
    """For a migration, losing a wrapper is recoverable; losing prose is not."""
    doc = html_to_doc("<section><article><p>kept</p></article></section>")
    assert "kept" in content.doc_to_text(doc)


def test_bare_text_gets_a_paragraph() -> None:
    doc = html_to_doc("no block wrapper at all")
    assert doc["content"][0]["type"] == "paragraph"
    assert content.doc_to_text(doc) == "no block wrapper at all"


def test_unclosed_tags_do_not_desync_the_parser() -> None:
    doc = html_to_doc("<p>one<p>two<p>three")
    assert content.doc_to_text(doc) == "one\ntwo\nthree"


def test_a_tag_name_in_prose_does_not_swallow_the_rest_of_the_field() -> None:
    """Found by the prod dry run, not by review.

    A real comment held raw Markdown (a GIN-134 leftover in an HTML column)
    mentioning `<title>` in a code span. `title` was in the skip-contents set, so
    the parser waited for a closing tag that never came and discarded everything
    after it — 125 tokens of someone's writing. An unclosed skip is unbounded,
    which is why only <script> and <style> get that treatment now.
    """
    html = "Implemented `<title>`/H1, meta description, and the FAQ section."
    doc = html_to_doc(html)
    text = content.doc_to_text(doc)
    assert "meta description" in text and "FAQ section" in text
    assert verify(html, doc) is None


def test_script_and_style_content_is_discarded() -> None:
    doc = html_to_doc("<p>visible</p><script>alert(1)</script><style>p{}</style>")
    text = content.doc_to_text(doc)
    assert "visible" in text
    assert "alert" not in text and "p{}" not in text


def test_hostile_attributes_do_not_survive_conversion() -> None:
    doc = html_to_doc('<p onclick="steal()">hi</p><a href="javascript:x">link</a>')
    html = content.doc_to_html(doc)
    assert "onclick" not in html
    assert "javascript:" not in html
    assert "hi" in html and "link" in html


def test_empty_html_becomes_an_empty_document() -> None:
    assert content.is_empty(html_to_doc(""))
    assert content.is_empty(html_to_doc("<p></p>"))


# --- verification is what makes the backfill safe ----------------------------


def test_verify_accepts_a_faithful_conversion() -> None:
    html = "<p>Hello <strong>world</strong></p>"
    assert verify(html, html_to_doc(html)) is None


def test_verify_ignores_whitespace_differences() -> None:
    html = "<p>a</p>\n\n   <p>b</p>"
    assert verify(html, html_to_doc(html)) is None


def test_verify_rejects_a_conversion_that_loses_text() -> None:
    """The check that stops a bad converter from silently eating a description."""
    html = "<p>important content here</p>"
    empty = {"type": "doc", "content": [{"type": "paragraph"}]}
    reason = verify(html, empty)
    assert reason and "text lost" in reason


def test_verify_tolerates_dropped_decoration() -> None:
    """Conversion is *expected* to change markup — only content must survive."""
    html = '<p><span class="x">kept</span></p>'
    assert verify(html, html_to_doc(html)) is None


def test_report_is_not_ok_when_rows_need_review() -> None:
    report = Report(table="t", scanned=2, converted=1)
    assert report.ok
    report.unverified.append(("id1", "text lost"))
    assert not report.ok
    assert "UNVERIFIED" in report.render()


# --- realistic legacy payloads -----------------------------------------------


def test_a_real_agent_authored_description_converts_cleanly() -> None:
    """Shaped like the descriptions the MCP tools have been writing."""
    html = (
        "<h2>Symptom</h2><p>Two related failures.</p>"
        "<ol><li><p><strong>Comments never convert.</strong> Hit on GIN-131.</p></li>"
        "<li><p>Descriptions stop converting when the Markdown mentions "
        "<code>&lt;p&gt;</code>.</p></li></ol>"
        "<blockquote><p>return text if _HTML_TAG.search(text)</p></blockquote>"
    )
    doc = html_to_doc(html)
    assert verify(html, doc) is None
    text = content.doc_to_text(doc)
    assert "Symptom" in text and "GIN-131" in text and "<p>" in text
    # And it survives the trip out to Markdown and back.
    assert content.markdown_to_doc(content.doc_to_markdown(doc)) == doc


def test_conversion_output_is_stable_under_a_second_pass() -> None:
    """Re-running the backfill over already-converted content must be a no-op."""
    html = "<h1>T</h1><p>body <em>x</em></p><ul><li><p>a</p></li></ul>"
    once = html_to_doc(html)
    assert html_to_doc(content.doc_to_html(once)) == once


# --- GIN-361: the Markdown-direction guard -----------------------------------


def test_markdown_guard_ignores_syntax_but_catches_lost_words() -> None:
    """The backfill's `verify` is for HTML input, where tags are not content.

    Applied to Markdown it reports every `**` and backtick as lost text — it
    rejected 11 of the 13 GIN-361 rows for exactly that. The Markdown-direction
    guard compares letter-words instead.
    """
    from gigsnano_api.content.reconvert_markdown import verify_markdown

    source = "Build React component `<SpendingBreakdown />` with **bold** text.\n"
    doc = content.markdown_to_doc(source)
    assert verify_markdown(source, doc) is None
    # Syntax-only differences are invisible to it, but a missing word is not.
    assert verify_markdown(source + "\n\nAn extra sentence entirely.", doc)


def test_bare_list_item_content_is_wrapped_in_a_paragraph() -> None:
    """`<li>text</li>` is legal HTML but `listItem > text` is an invalid document.

    ProseMirror's listItem requires block children. Unwrapped it renders back to
    HTML by luck, serializes to an *empty* Markdown list item, and would be
    rejected by the editor. Found when the read flag went on in prod and an
    agent's markdown came back as `-\n-\n-`.
    """
    doc = html_to_doc("<ul><li><code>a</code></li><li>plain</li></ul>")
    for item in _find_all(doc, "listItem"):
        assert item["content"][0]["type"] == "paragraph"
    assert content.doc_to_markdown(doc) == "- `a`\n- plain\n"


@pytest.mark.parametrize(
    "html,expected",
    [
        ("<blockquote>bare quote</blockquote>", "> bare quote\n"),
        ("<table><tr><td>cell</td></tr></table>", "| cell |\n| --- |\n"),
    ],
)
def test_other_block_containers_wrap_bare_inline_content(html: str, expected: str) -> None:
    assert content.doc_to_markdown(html_to_doc(html)) == expected


def test_a_mark_inside_a_list_item_does_not_split_it() -> None:
    """Reported on GIN-270 against live MCP output.

    `<li><b>Tabs</b> or x</li>` came back as a broken two-block item:

        - **Tabs**

           or x

    Cause was a stack desync — a mark's open tag pushed a placeholder onto the
    node stack to "keep the stacks in step", but `_inline_target` also pushes
    (the wrapper paragraph a list item needs), so `</strong>` popped the
    paragraph instead of its own entry and the rest of the item started a new
    one. Marks now touch only the mark list.
    """
    doc = html_to_doc(
        "<ul><li><strong>Tabs</strong> or <strong>ToggleGroup</strong> for filters.</li></ul>"
    )
    item = _find(doc, "listItem")
    assert len(item["content"]) == 1, "the item should be a single paragraph"
    assert content.doc_to_markdown(doc) == "- **Tabs** or **ToggleGroup** for filters.\n"


def test_a_closing_code_tag_does_not_bleed_its_mark_onto_later_text() -> None:
    """The other half of the same desync: `</code>` was matched against the
    open-tag stack that marks no longer touch, so the mark stayed open and every
    following character came back as code — `` `code.` `` instead of `` `code` ``."""
    doc = html_to_doc("<p>see <code>x</code> then plain</p>")
    marked = [n for n in _find_all(doc, "text") if n.get("marks")]
    assert [n["text"] for n in marked] == ["x"]


def test_whitespace_between_list_items_does_not_become_a_bullet() -> None:
    """GIN-270's phantom `-` between every real item.

    Pretty-printed markup puts a newline between `</li>` and `<li>`. That landed
    as a text node *inside the list*, and the serializer treated every child of a
    list as an item — so each newline rendered as an empty bullet. The HTML had no
    empty `<li>` and the document had no empty item; the serializer was inventing
    them from whitespace.
    """
    doc = html_to_doc("<ul>\n  <li><strong>A</strong> one</li>\n  <li>two</li>\n</ul>")
    assert content.doc_to_markdown(doc) == "- **A** one\n- two\n"

    ordered = html_to_doc("<ol>\n  <li><p>one</p></li>\n  <li><p>two</p></li>\n</ol>")
    assert content.doc_to_markdown(ordered) == "1. one\n2. two\n"


def test_a_stray_node_inside_a_list_never_renders_as_an_empty_bullet() -> None:
    """Belt and braces on the serializer: even a malformed document shouldn't
    produce a bullet with nothing in it."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [{"type": "paragraph",
                     "content": [{"type": "text", "text": "real"}]}]},
                    {"type": "text", "text": " "},
                ],
            }
        ],
    }
    assert content.doc_to_markdown(doc) == "- real\n"
