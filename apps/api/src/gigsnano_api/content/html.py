"""Derived HTML rendering — canonical JSON to the markup TipTap expects.

This output feeds the legacy `*_html` columns during the GIN-297 rollout and any
consumer that can't take JSON. It is a *derived* value: never parsed back, never
authoritative, and safe to regenerate at any time (ADR 0001 section 1).

No sanitizer runs here, and none is needed: every string reaching the DOM is
escaped by `_escape`, and every tag and attribute is emitted by this module from a
document that already passed the `schema.validate_doc` allow-list. The trust
boundary is the write path, not the render path.

That is only true of HTML *we* generated. HTML read out of a legacy column
predates the allow-list and still needs sanitizing at its own sink — see GIN-354.
"""

from __future__ import annotations

from typing import Any

from .schema import ContentError

_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}


def _escape(text: str) -> str:
    return "".join(_ESCAPES.get(c, c) for c in text)


def _attr(name: str, value: Any) -> str:
    if value is None or value == "":
        return ""
    return f' {name}="{_escape(str(value))}"'


def doc_to_html(doc: dict[str, Any]) -> str:
    """Render a canonical document to HTML."""
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise ContentError("expected a doc node")
    html = "".join(_node(child) for child in doc.get("content") or [])
    # Matches what TipTap emits for an untouched editor, so a round trip through
    # the derived column doesn't flip a field between "" and "<p></p>".
    return html or "<p></p>"


_SIMPLE_BLOCKS = {
    "paragraph": "p",
    "blockquote": "blockquote",
    "bulletList": "ul",
    "listItem": "li",
}


def _node(node: dict[str, Any]) -> str:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}
    children = node.get("content") or []

    if node_type == "text":
        return _marked_text(node)
    if node_type == "hardBreak":
        return "<br>"
    if node_type == "horizontalRule":
        return "<hr>"

    if node_type in _SIMPLE_BLOCKS:
        tag = _SIMPLE_BLOCKS[node_type]
        style = _align_style(attrs)
        return f"<{tag}{style}>{_children(children)}</{tag}>"

    if node_type == "heading":
        level = min(max(int(attrs.get("level") or 1), 1), 6)
        return f"<h{level}{_align_style(attrs)}>{_children(children)}</h{level}>"

    if node_type == "orderedList":
        start = attrs.get("start") or 1
        start_attr = _attr("start", start) if int(start) != 1 else ""
        return f"<ol{start_attr}>{_children(children)}</ol>"

    if node_type == "codeBlock":
        language = attrs.get("language")
        cls = _attr("class", f"language-{language}") if language else ""
        body = _escape("".join(c.get("text", "") for c in children))
        return f"<pre><code{cls}>{body}</code></pre>"

    if node_type == "taskList":
        return f'<ul data-type="taskList">{_children(children)}</ul>'
    if node_type == "taskItem":
        checked = "true" if attrs.get("checked") else "false"
        box = f'<input type="checkbox"{" checked" if attrs.get("checked") else ""}>'
        return (
            f'<li data-type="taskItem" data-checked="{checked}">'
            f"<label>{box}</label><div>{_children(children)}</div></li>"
        )

    if node_type == "image":
        src = f"gigsnano:file/{attrs['fileId']}" if attrs.get("fileId") else attrs.get("src")
        return f"<img{_attr('src', src)}{_attr('alt', attrs.get('alt'))}{_attr('title', attrs.get('title'))}>"

    if node_type == "mention":
        # Matches the element the editor already emits
        # (extensions/mention/mention-extension.ts:41) so legacy readers and
        # lib/mentions.py keep working unchanged through the rollout.
        entity_name = f"{attrs.get('entityType') or 'user'}_mention"
        return (
            "<mention-component"
            f"{_attr('id', attrs.get('entityId'))}"
            f"{_attr('entity_identifier', attrs.get('entityId'))}"
            f"{_attr('entity_name', entity_name)}"
            f">{_escape(attrs.get('label') or '')}</mention-component>"
        )

    if node_type == "workItemRef":
        return (
            "<work-item-ref"
            f"{_attr('data-work-item-id', attrs.get('workItemId'))}"
            f"{_attr('data-code', attrs.get('code'))}"
            f">{_escape(attrs.get('code') or '')}</work-item-ref>"
        )

    if node_type == "attachment":
        return (
            "<attachment-ref"
            f"{_attr('data-file-id', attrs.get('fileId'))}"
            f"{_attr('data-mime-type', attrs.get('mimeType'))}"
            f">{_escape(attrs.get('fileName') or '')}</attachment-ref>"
        )

    if node_type == "table":
        return f"<table><tbody>{_children(children)}</tbody></table>"
    if node_type == "tableRow":
        return f"<tr>{_children(children)}</tr>"
    if node_type in ("tableCell", "tableHeader"):
        tag = "td" if node_type == "tableCell" else "th"
        span = ""
        if int(attrs.get("colspan") or 1) != 1:
            span += _attr("colspan", attrs["colspan"])
        if int(attrs.get("rowspan") or 1) != 1:
            span += _attr("rowspan", attrs["rowspan"])
        return f"<{tag}{span}>{_children(children)}</{tag}>"

    if node_type == "unknownBlock":
        # Rendered inert and visible. The raw payload rides along in a data
        # attribute so a round trip through HTML doesn't destroy it.
        original = attrs.get("originalType") or "unknown"
        return (
            f'<div data-unknown-node{_attr("data-original-type", original)}'
            f'{_attr("data-raw", attrs.get("raw"))}>'
            f"[unsupported content: {_escape(original)}]</div>"
        )

    return _children(children)


def _children(nodes: list[dict[str, Any]]) -> str:
    return "".join(_node(child) for child in nodes)


def _align_style(attrs: dict[str, Any]) -> str:
    align = attrs.get("textAlign")
    if align in ("left", "center", "right"):
        return f' style="text-align: {align}"'
    return ""


_MARK_TAGS = {
    "bold": "strong",
    "italic": "em",
    "strike": "s",
    "underline": "u",
    "code": "code",
}


def _marked_text(node: dict[str, Any]) -> str:
    out = _escape(node.get("text") or "")
    marks = node.get("marks") or []

    for mark in marks:
        tag = _MARK_TAGS.get(mark.get("type") or "")
        if tag:
            out = f"<{tag}>{out}</{tag}>"

    for mark in marks:
        if mark.get("type") == "link":
            attrs = mark.get("attrs") or {}
            # rel is forced rather than trusted from the document: an inbound
            # `rel=""` shouldn't be able to turn off the tabnabbing protection.
            rel = 'rel="noopener noreferrer nofollow"'
            target = _attr("target", attrs.get("target") or "_blank")
            out = f'<a{_attr("href", attrs.get("href"))}{target} {rel}>{out}</a>'
            break

    return out
