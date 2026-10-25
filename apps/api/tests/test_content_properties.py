"""GIN-302 — property and fuzz coverage for the content conversion library.

Two families:

  * Generated documents must satisfy the round-trip invariants, not just the
    hand-written fixtures. Fixtures cover the shapes we thought of; this covers
    the combinations we didn't.
  * Arbitrary bytes must not crash the parser or escape the escaper.

Deterministic by design — a fixed seed per case, so a failure is reproducible from
the test id alone rather than "it went red once on CI".
"""

from __future__ import annotations

import random
import string

import pytest

from gigsnano_api import content

_WORDS = ["alpha", "beta", "gamma", "délta", "日本", "x", "under_score", "a*b"]
_MARKS = ["bold", "italic", "strike", "code"]


def _text(rng: random.Random) -> dict:
    node = {"type": "text", "text": " ".join(rng.choices(_WORDS, k=rng.randint(1, 5)))}
    if rng.random() < 0.4:
        # `code` doesn't nest with the others in Markdown, so keep it exclusive.
        if rng.random() < 0.25:
            node["marks"] = [{"type": "code"}]
        else:
            picked = rng.sample(_MARKS[:3], k=rng.randint(1, 2))
            node["marks"] = [{"type": m} for m in sorted(picked)]
    return node


def _inline(rng: random.Random) -> list[dict]:
    out: list[dict] = []
    for i in range(rng.randint(1, 4)):
        if i:
            # Separate runs with a space. Two differently-marked runs butted
            # directly together are not always expressible in CommonMark — see
            # test_multi_mark_run_against_a_word_is_a_known_limitation — and that
            # limitation is pinned by its own test rather than re-found here on
            # every seed.
            out.append({"type": "text", "text": " "})
        roll = rng.random()
        if roll < 0.12:
            out.append(
                {
                    "type": "mention",
                    "attrs": {
                        "entityId": f"{rng.randrange(16**8):08x}",
                        "entityType": rng.choice(["user", "team"]),
                        "label": rng.choice(_WORDS),
                    },
                }
            )
        elif roll < 0.2:
            out.append(
                {
                    "type": "workItemRef",
                    "attrs": {
                        "workItemId": f"{rng.randrange(16**8):08x}",
                        "code": f"GIN-{rng.randint(1, 999)}",
                        "title": "",
                    },
                }
            )
        else:
            out.append(_text(rng))
    return out


def _block(rng: random.Random, depth: int = 0) -> dict:
    choices = ["paragraph", "heading", "codeBlock", "bulletList", "orderedList", "taskList"]
    if depth < 1:
        choices += ["blockquote"]
    kind = rng.choice(choices)

    if kind == "paragraph":
        return {"type": "paragraph", "attrs": {"textAlign": None}, "content": _inline(rng)}
    if kind == "heading":
        return {
            "type": "heading",
            "attrs": {"level": rng.randint(1, 6), "textAlign": None},
            "content": _inline(rng),
        }
    if kind == "codeBlock":
        body = rng.choice(["x = 1", "<div>hi</div>", "a\nb", "## not a heading"])
        return {
            "type": "codeBlock",
            "attrs": {"language": rng.choice([None, "python", "mermaid"])},
            "content": [{"type": "text", "text": body}],
        }
    if kind == "blockquote":
        return {"type": "blockquote", "content": [_block(rng, depth + 1)]}

    item_type = "taskItem" if kind == "taskList" else "listItem"
    items = []
    for _ in range(rng.randint(1, 3)):
        item: dict = {"type": item_type, "content": [
            {"type": "paragraph", "attrs": {"textAlign": None}, "content": _inline(rng)}
        ]}
        if item_type == "taskItem":
            item["attrs"] = {"checked": rng.random() < 0.5}
        items.append(item)
    node = {"type": kind, "content": items}
    if kind == "orderedList":
        node["attrs"] = {"start": 1}
    return node


def _document(seed: int) -> dict:
    rng = random.Random(seed)
    doc = {"type": "doc", "content": [_block(rng) for _ in range(rng.randint(1, 6))]}
    return content.validate_doc(doc)


@pytest.mark.parametrize("seed", range(120))
def test_generated_documents_round_trip_through_markdown(seed: int) -> None:
    doc = _document(seed)
    assert content.markdown_to_doc(content.doc_to_markdown(doc)) == doc


@pytest.mark.parametrize("seed", range(120))
def test_generated_markdown_is_a_fixed_point(seed: int) -> None:
    once = content.doc_to_markdown(_document(seed))
    twice = content.doc_to_markdown(content.markdown_to_doc(once))
    assert once == twice


#: Exactly the tags content/html.py can emit. Anything else in the output means
#: input escaped the escaper.
_ALLOWED_TAGS = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "strong", "em", "s", "u",
    "code", "pre", "blockquote", "ul", "ol", "li", "a", "img", "table", "tbody",
    "tr", "td", "th", "input", "label", "div", "mention-component",
    "work-item-ref", "attachment-ref",
}
_ALLOWED_ATTRS = {
    "href", "target", "rel", "src", "alt", "title", "class", "start", "colspan",
    "rowspan", "style", "type", "checked", "id", "entity_identifier", "entity_name",
    "data-type", "data-checked", "data-work-item-id", "data-code", "data-file-id",
    "data-mime-type", "data-unknown-node", "data-original-type", "data-raw",
}


def _assert_html_is_inert(html: str) -> None:
    """Parse the rendered HTML and assert every tag and attribute is one we emit.

    Substring checks (`"onerror=" not in html`) are the wrong assertion here:
    escaped literal text legitimately contains those bytes and is completely
    inert. What matters is whether the browser would see a tag or an attribute we
    didn't intend, so this actually parses the output.
    """
    from html.parser import HTMLParser

    problems: list[str] = []

    class Checker(HTMLParser):
        def handle_starttag(self, tag: str, attrs: list) -> None:
            if tag not in _ALLOWED_TAGS:
                problems.append(f"unexpected tag <{tag}>")
            for name, value in attrs:
                if name.startswith("on"):
                    problems.append(f"event handler {name}=")
                elif name not in _ALLOWED_ATTRS:
                    problems.append(f"unexpected attribute {name}=")
                if value and not content.link_scheme_ok(value) and name in (
                    "href",
                    "src",
                ):
                    problems.append(f"unsafe {name}={value!r}")

    Checker(convert_charrefs=True).feed(html)
    assert not problems, f"{problems} in {html!r}"


@pytest.mark.parametrize("seed", range(60))
def test_generated_html_is_inert(seed: int) -> None:
    _assert_html_is_inert(content.doc_to_html(_document(seed)))


_FUZZ_ALPHABET = string.printable + "日本語" + "​﻿́😀"


@pytest.mark.parametrize("seed", range(200))
def test_arbitrary_input_never_crashes_the_parser(seed: int) -> None:
    rng = random.Random(seed)
    noise = "".join(rng.choices(_FUZZ_ALPHABET, k=rng.randint(0, 300)))

    doc = content.markdown_to_doc(noise)  # must not raise
    content.doc_to_text(doc)

    # Whatever went in, nothing executable comes out.
    _assert_html_is_inert(content.doc_to_html(doc))

    # Line noise can contain an unbalanced code-span delimiter, which the first
    # serialize legitimately re-balances — so the invariant is convergence, not
    # equality on pass one. It must then be stable forever.
    once = content.markdown_to_doc(content.doc_to_markdown(doc))
    twice = content.markdown_to_doc(content.doc_to_markdown(once))
    assert twice == once


@pytest.mark.parametrize(
    "payload",
    [
        '<img src=x onerror="alert(1)">',
        "<script>alert(1)</script>",
        "<iframe src=//evil></iframe>",
        "<svg/onload=alert(1)>",
        "[a](javascript:alert(1))",
        "![x](javascript:alert(1))",
        "<a href=\"javascript:alert(1)\">x</a>",
        "]]><script>alert(1)</script>",
        "&lt;script&gt;alert(1)&lt;/script&gt;",
    ],
)
def test_known_xss_payloads_render_inert(payload: str) -> None:
    _assert_html_is_inert(content.doc_to_html(content.markdown_to_doc(payload)))


@pytest.mark.parametrize(
    "payload",
    [
        '<img src=x onerror="alert(1)">',
        "<script>alert(1)</script>",
        "[a](javascript:alert(1))",
    ],
)
def test_xss_payloads_survive_as_readable_text(payload: str) -> None:
    """Inert is not the same as deleted — the user's words must still be there."""
    text = content.doc_to_text(content.markdown_to_doc(payload))
    assert "alert(1)" in text


def test_multi_mark_run_against_a_word_is_a_known_limitation() -> None:
    """`**~~old~~**new` cannot be expressed in CommonMark, and we don't pretend.

    Whichever mark is outermost, its closing delimiter is preceded by the inner
    mark's punctuation and followed by a word character, which fails the
    right-flanking rules — so it can't close. GFM offers no escape hatch short of
    raw HTML, which the profile forbids.

    The text always survives; only the marks are lost, and the loss is visible in
    the output rather than silent. Canonical JSON is unaffected — this is an
    export-format limitation, which is why JSON is the source of truth.
    """
    doc = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "old",
                            "marks": [{"type": "bold"}, {"type": "strike"}],
                        },
                        {"type": "text", "text": "new"},
                    ],
                }
            ],
        }
    )
    md = content.doc_to_markdown(doc)
    assert "old" in md and "new" in md

    # Separated by a space, the same content round-trips exactly.
    spaced = content.validate_doc(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "old",
                            "marks": [{"type": "bold"}, {"type": "strike"}],
                        },
                        {"type": "text", "text": " new"},
                    ],
                }
            ],
        }
    )
    assert content.markdown_to_doc(content.doc_to_markdown(spaced)) == spaced


def test_content_within_the_nesting_limit_survives() -> None:
    deep = "> " * 50 + "bottom\n"
    assert "bottom" in content.doc_to_text(content.markdown_to_doc(deep))


def test_nesting_past_the_limit_is_bounded_not_a_crash() -> None:
    """markdown-it's recursion guard truncates rather than recursing forever.

    A documented ceiling (markdown.MAX_NESTING), not silent loss of ordinary
    content: no real document nests 100 blockquotes deep.
    """
    deep = "> " * (content.markdown.MAX_NESTING * 4) + "bottom\n"
    doc = content.markdown_to_doc(deep)  # must not raise
    content.doc_to_html(doc)
    content.doc_to_markdown(doc)


def test_very_long_single_line_is_handled() -> None:
    doc = content.markdown_to_doc("word " * 50_000)
    assert content.doc_to_text(doc).startswith("word")
