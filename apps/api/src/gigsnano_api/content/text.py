"""Derived plain text — the search and notification projection.

Replaces `ILIKE` over raw HTML (features/search/service.py:40), which matched tag
names and missed any word a tag boundary split. Also replaces the three divergent
`re.sub(r"<[^>]+>", ...)` strippers in work_item_io/columns.py, gigs_ai/prompt.py
and lib/mentions.py, which disagreed on entities and whitespace.
"""

from __future__ import annotations

import re
from html import unescape
from typing import Any

_WS = re.compile(r"\s+")
_TAG = re.compile(r"<[^>]+>")


def normalize_text(text: str) -> str:
    """Collapse whitespace so two renderings of the same content compare equal.

    HTML whitespace is presentational: `<p>a</p><p>b</p>` and `<p>a</p>\\n <p>b</p>`
    say the same thing. Without this, every comparison drowns in differences no
    reader could see.
    """
    return _WS.sub(" ", text).strip()


def html_to_text(html: str) -> str:
    """The text a reader would see in a legacy HTML string.

    Approximate by construction — a regex cannot tell `<->` in prose from a tag,
    and it guesses wrong. That is acceptable here because every caller uses it
    conservatively (asking only "did anything go missing"), never as a source of
    truth. Where exactness matters, parse instead.
    """
    return normalize_text(unescape(_TAG.sub(" ", html)))

_BLOCK_SEPARATORS = {
    "paragraph",
    "heading",
    "blockquote",
    "codeBlock",
    "listItem",
    "taskItem",
    "tableRow",
    "horizontalRule",
    "unknownBlock",
}


def doc_to_text(doc: dict[str, Any]) -> str:
    """Flatten a canonical document to searchable plain text.

    Semantic atoms contribute their display fallback — a mention reads as its
    label, a work-item reference as its code — so searching for "@Jessy" or
    "GIN-297" finds the documents that reference them.
    """
    if not isinstance(doc, dict):
        return ""
    parts: list[str] = []
    _walk(doc, parts)
    # Collapse the separators pushed by nested blocks into single blank lines.
    text = "".join(parts)
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def _walk(node: dict[str, Any], parts: list[str]) -> None:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}

    if node_type == "text":
        parts.append(node.get("text") or "")
        return
    if node_type == "hardBreak":
        parts.append("\n")
        return
    if node_type == "mention":
        parts.append(f"@{attrs.get('label') or ''}")
        return
    if node_type == "workItemRef":
        code = attrs.get("code") or ""
        title = attrs.get("title") or ""
        parts.append(f"{code} {title}".strip())
        return
    if node_type == "attachment":
        parts.append(attrs.get("fileName") or "")
        return
    if node_type == "image":
        # Alt text only. A URL in the search index is noise that matches nothing a
        # human would type.
        if attrs.get("alt"):
            parts.append(attrs["alt"])
        return
    if node_type == "tableCell" or node_type == "tableHeader":
        for child in node.get("content") or []:
            _walk(child, parts)
        parts.append(" ")
        return

    for child in node.get("content") or []:
        _walk(child, parts)

    if node_type in _BLOCK_SEPARATORS:
        parts.append("\n")
