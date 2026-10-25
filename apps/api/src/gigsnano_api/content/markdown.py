"""The GigsNano Markdown profile: Markdown <-> canonical JSON.

CommonMark + GFM tables, strikethrough and task lists, fenced code (including
`mermaid`), and semantic references written as ordinary CommonMark links under a
`gigsnano:` URI scheme. Full profile: ADR 0001 section 5.

Two properties this module exists to guarantee, both pinned by
tests/test_content_roundtrip.py against tests/fixtures/content/:

  * JSON -> Markdown -> JSON is lossless for every `live` node and mark.
  * Markdown -> JSON -> Markdown is idempotent from the second pass. The first pass
    normalises (`*em*` becomes `_em_`, setext headings become ATX, list bullets
    become `-`), which is why determinism is stated "after normalization".

Raw HTML is not parsed. `html=False` on the parser turns any HTML block or inline
tag into literal text, so `<p>` inside a code span or a fenced block survives as
what it looks like. That is the GIN-134 failure mode removed at the root: there is
no format guess left to get wrong, because the caller states the format and this
parser only ever reads Markdown.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from markdown_it import MarkdownIt
from markdown_it.token import Token
from mdit_py_plugins.tasklists import tasklists_plugin

from .schema import (
    ContentError,
    link_scheme_ok,
    merge_adjacent_text,
    parse_gigsnano_uri,
    validate_doc,
)

# `commonmark` + the GFM subset the ADR approved. `html=False` is the security
# boundary; `linkify` is off because auto-linking bare URLs is an editor behaviour
# (StarterKit's `autolink`), not a storage one — turning it on here would make
# Markdown -> JSON -> Markdown non-idempotent for any text containing a URL.
#: markdown-it's recursion guard. Its default of 20 is low enough that a merely
#: deeply-indented real document loses content, and content loss is the one thing
#: this library must not do quietly. 100 clears any hand-written document by a wide
#: margin while still bounding the parse — input nested past it is truncated by the
#: guard, which is a documented ceiling, not a silent bug.
MAX_NESTING = 100

_md = (
    MarkdownIt(
        "commonmark",
        {
            "html": False,
            "linkify": False,
            "typographer": False,
            "maxNesting": MAX_NESTING,
        },
    )
    .enable("table")
    .enable("strikethrough")
    .use(tasklists_plugin, enabled=True)
)

_MARK_BY_TOKEN = {
    "strong": "bold",
    "em": "italic",
    "s": "strike",
}

#: Info string carrying a node this version doesn't know. Round-trippable on
#: purpose — see ADR 0001 section 4.3.
_UNKNOWN_FENCE = "gigsnano-unknown"

#: Kept in step with html_import._NEEDS_BLOCK_CHILD — both parsers must produce
#: the same document for the same content, or a round trip between them differs.
_NEEDS_BLOCK_CHILD = {"listItem", "taskItem", "blockquote", "tableCell", "tableHeader"}


def _unknown_type_of(raw: str) -> str:
    import json

    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return "unknown"
    if isinstance(parsed, dict) and isinstance(parsed.get("type"), str):
        return parsed["type"]
    return "unknown"


# --- Markdown -> JSON --------------------------------------------------------


def markdown_to_doc(text: str) -> dict[str, Any]:
    """Parse Markdown into a validated canonical document."""
    if not isinstance(text, str):
        raise ContentError("markdown input must be a string")

    tokens = _md.parse(text)
    content = _parse_blocks(iter(tokens))
    if not content:
        content = [{"type": "paragraph"}]
    return validate_doc({"type": "doc", "content": content})


def _parse_blocks(tokens: Iterable[Token]) -> list[dict[str, Any]]:
    """Fold markdown-it's flat open/close token stream into a node tree."""
    out: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []

    def append(node: dict[str, Any]) -> None:
        (stack[-1]["content"] if stack else out).append(node)

    def push(node: dict[str, Any]) -> None:
        node.setdefault("content", [])
        stack.append(node)

    def pop() -> None:
        """Close the open node and hand it to its parent, splitting mixed lists.

        GFM writes a plain item and a task item with the same `-` bullet, so a
        bulletList followed by a taskList parses back as one list holding both
        kinds. Splitting it into runs here is what makes that round trip lossless.
        """
        if not stack:
            return
        node = stack.pop()
        if not node["content"]:
            del node["content"]
        for finished in _split_task_runs(node):
            (stack[-1]["content"] if stack else out).append(finished)

    for token in tokens:
        t = token.type

        if t == "paragraph_open":
            push({"type": "paragraph"})
        elif t == "heading_open":
            push({"type": "heading", "attrs": {"level": int(token.tag[1:])}})
        elif t == "blockquote_open":
            push({"type": "blockquote"})
        elif t == "bullet_list_open":
            # Always a bulletList here; `pop` re-splits it once the items' task
            # state is known, since GFM allows both kinds in one list.
            push({"type": "bulletList"})
        elif t == "ordered_list_open":
            start = token.attrGet("start")
            node: dict[str, Any] = {"type": "orderedList"}
            if start is not None:
                node["attrs"] = {"start": int(start)}
            push(node)
        elif t == "list_item_open":
            push({"type": "listItem"})
        elif t == "table_open":
            push({"type": "table"})
        elif t == "tr_open":
            push({"type": "tableRow"})
        elif t in ("td_open", "th_open"):
            push({"type": "tableCell" if t == "td_open" else "tableHeader"})
        elif t in ("thead_open", "tbody_open", "thead_close", "tbody_close"):
            # GFM has no separate head/body node; rows carry header-ness via cells.
            continue
        elif t.endswith("_close"):
            pop()

        elif t == "inline":
            children, checked = _parse_inline(token.children or [])
            if checked is not None:
                # The tasklists plugin marks the checkbox on the inline content,
                # not on the list item, so the state has to be lifted here — and
                # the item becomes a taskItem rather than a plain one.
                for node in reversed(stack):
                    if node["type"] in ("listItem", "taskItem"):
                        node["type"] = "taskItem"
                        node["attrs"] = {"checked": checked}
                        break
            if stack:
                # markdown-it puts a paragraph inside list items but not inside
                # table cells, and a ProseMirror cell requires block children —
                # so wrap here rather than emit an invalid `tableCell > text`.
                # The HTML importer wraps the same set; the two must agree or the
                # same table round-trips to two different documents.
                if stack[-1]["type"] in _NEEDS_BLOCK_CHILD:
                    cell = {"type": "paragraph", "content": list(children)}
                    stack[-1]["content"].append(cell)
                else:
                    stack[-1]["content"].extend(children)
            else:  # pragma: no cover - markdown-it always wraps inline in a block
                out.extend(children)
        elif t in ("fence", "code_block"):
            # `.split()` on an empty info string yields [], so index [0] would
            # raise — an unlabelled fence is the common case, not an edge case.
            language = next(iter((token.info or "").split()), None)
            body = token.content.rstrip("\n")
            if language == _UNKNOWN_FENCE:
                # Reconstitute a node some newer version of us wrote, rather than
                # leaving it as a code block a user could then "helpfully" edit.
                append(
                    {
                        "type": "unknownBlock",
                        "attrs": {
                            "originalType": _unknown_type_of(body),
                            "raw": body,
                        },
                    }
                )
                continue
            node = {"type": "codeBlock"}
            if language:
                node["attrs"] = {"language": language}
            if body:
                node["content"] = [{"type": "text", "text": body}]
            append(node)
        elif t == "hr":
            append({"type": "horizontalRule"})

    return out


def _split_task_runs(node: dict[str, Any]) -> list[dict[str, Any]]:
    """Split a bulletList holding both task and plain items into consecutive runs.

    `- a` / `- [ ] b` is a single list in GFM but two nodes in the schema. Emitting
    one mixed list would lose the distinction on the way back out.
    """
    if node.get("type") != "bulletList":
        return [node]
    items = node.get("content") or []
    if not items:
        return [node]

    runs: list[dict[str, Any]] = []
    for item in items:
        wanted = "taskList" if item.get("type") == "taskItem" else "bulletList"
        if runs and runs[-1]["type"] == wanted:
            runs[-1]["content"].append(item)
        else:
            runs.append({"type": wanted, "content": [item]})
    return runs


def _parse_inline(
    tokens: list[Token],
) -> tuple[list[dict[str, Any]], bool | None]:
    """Returns the inline nodes, plus the task checkbox state when one was present."""
    out: list[dict[str, Any]] = []
    marks: list[dict[str, Any]] = []
    checked: bool | None = None
    strip_leading_space = False

    def with_marks(node: dict[str, Any]) -> dict[str, Any]:
        if marks:
            node["marks"] = [dict(m) for m in marks]
        return node

    i = 0
    while i < len(tokens):
        token = tokens[i]
        t = token.type

        if t == "text":
            text = token.content
            if strip_leading_space:
                # The plugin swaps `[x]` for an <input> but leaves the space that
                # separated it from the item's text.
                text = text.lstrip(" ")
                strip_leading_space = False
            if text:
                out.append(with_marks({"type": "text", "text": text}))
        elif t == "html_inline":
            # `html=False` means the only html_inline the parser can emit is the
            # tasklists plugin's own checkbox.
            if token.content.startswith("<input"):
                checked = "checked" in token.content
                strip_leading_space = True
        elif t == "code_inline":
            node = {"type": "text", "text": token.content}
            node["marks"] = [dict(m) for m in marks] + [{"type": "code"}]
            out.append(node)
        elif t == "softbreak":
            # A soft wrap is whitespace, not a break. Collapsing it here is what
            # makes re-serialising a long paragraph stable.
            out.append(with_marks({"type": "text", "text": " "}))
        elif t == "hardbreak":
            out.append({"type": "hardBreak"})
        elif token.nesting == 1 and t.removesuffix("_open") in _MARK_BY_TOKEN:
            marks.append({"type": _MARK_BY_TOKEN[t.removesuffix("_open")]})
        elif token.nesting == -1 and t.removesuffix("_close") in _MARK_BY_TOKEN:
            wanted = _MARK_BY_TOKEN[t.removesuffix("_close")]
            for j in range(len(marks) - 1, -1, -1):
                if marks[j]["type"] == wanted:
                    del marks[j]
                    break
        elif t == "link_open":
            href = token.attrGet("href") or ""
            close = _find_close(tokens, i, "link_open", "link_close")
            inner = tokens[i + 1 : close]
            semantic = _semantic_node(href, _inline_text(inner))
            if semantic is not None:
                out.append(semantic)
                i = close + 1
                continue
            if link_scheme_ok(href):
                marks.append({"type": "link", "attrs": {"href": href}})
            else:
                # Unsafe scheme: keep the label, drop the link. Never silently
                # delete the user's words because the URL was hostile.
                marks.append({"type": "__dropped_link"})
        elif t == "link_close":
            for j in range(len(marks) - 1, -1, -1):
                if marks[j]["type"] in ("link", "__dropped_link"):
                    del marks[j]
                    break
        elif t == "image":
            out.append(_image_node(token))

        i += 1

    # `__dropped_link` is a parse-time sentinel, never a persisted mark.
    for node in out:
        if "marks" in node:
            node["marks"] = [m for m in node["marks"] if m["type"] != "__dropped_link"]
            if not node["marks"]:
                del node["marks"]
    return merge_adjacent_text(out), checked


def _find_close(tokens: list[Token], start: int, open_type: str, close_type: str) -> int:
    depth = 0
    for j in range(start, len(tokens)):
        if tokens[j].type == open_type:
            depth += 1
        elif tokens[j].type == close_type:
            depth -= 1
            if depth == 0:
                return j
    return len(tokens) - 1


def _inline_text(tokens: list[Token]) -> str:
    return "".join(t.content for t in tokens if t.type in ("text", "code_inline"))


def _semantic_node(href: str, label: str) -> dict[str, Any] | None:
    """Turn `[@Jessy](gigsnano:user/<uuid>)` into the atom it addresses."""
    parsed = parse_gigsnano_uri(href)
    if parsed is None:
        return None
    kind, ident = parsed

    if kind in ("user", "team"):
        return {
            "type": "mention",
            "attrs": {
                "entityId": ident,
                "entityType": kind,
                "label": label.lstrip("@"),
            },
        }
    if kind == "work-item":
        return {
            "type": "workItemRef",
            "attrs": {"workItemId": ident, "code": label, "title": ""},
        }
    if kind == "file":
        return {
            "type": "attachment",
            "attrs": {
                "fileId": ident,
                "fileName": label,
                "mimeType": None,
                "size": None,
            },
        }
    return None  # pragma: no cover - GIGSNANO_URI_KINDS is exhaustive above


def _image_node(token: Token) -> dict[str, Any]:
    src = token.attrGet("src") or ""
    alt = _inline_text(token.children or [])
    parsed = parse_gigsnano_uri(src)
    attrs: dict[str, Any] = {
        "fileId": parsed[1] if parsed and parsed[0] == "file" else None,
        "src": None if parsed else src,
        "alt": alt or None,
        "title": token.attrGet("title"),
    }
    return {"type": "image", "attrs": attrs}


# --- JSON -> Markdown --------------------------------------------------------

# Escaped so a round trip can't promote plain text into structure. Deliberately
# narrower than "every punctuation mark": over-escaping makes exported Markdown
# unreadable for humans, which is half of why it's the interchange format.
_ESCAPE_INLINE = re.compile(r"([\\`*_\[\]<>])")
_ESCAPE_LINE_START = re.compile(r"^(\s*)([-+*>#]|\d+[.)])(\s)")


def doc_to_markdown(doc: dict[str, Any]) -> str:
    """Serialize a canonical document to the GigsNano Markdown profile."""
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise ContentError("expected a doc node")
    body = _blocks_to_markdown(doc.get("content") or [])
    return body.strip("\n") + "\n" if body.strip("\n") else ""


def _blocks_to_markdown(nodes: list[dict[str, Any]], indent: str = "") -> str:
    chunks = [_block_to_markdown(node, indent) for node in nodes]
    return "\n\n".join(c for c in chunks if c.strip())


def _block_to_markdown(node: dict[str, Any], indent: str = "") -> str:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}
    content = node.get("content") or []

    if node_type == "paragraph":
        return _prefix(_inline_to_markdown(content), indent)
    if node_type == "heading":
        level = min(max(int(attrs.get("level") or 1), 1), 6)
        return _prefix(f"{'#' * level} {_inline_to_markdown(content)}", indent)
    if node_type == "codeBlock":
        language = attrs.get("language") or ""
        body = "".join(c.get("text", "") for c in content)
        fence = _fence_for(body)
        return _prefix(f"{fence}{language}\n{body}\n{fence}", indent, all_lines=False)
    if node_type == "blockquote":
        inner = _blocks_to_markdown(content)
        quoted = "\n".join(f"> {line}".rstrip() for line in inner.split("\n"))
        return _prefix(quoted, indent, all_lines=False)
    if node_type == "horizontalRule":
        return f"{indent}---"
    if node_type in ("bulletList", "orderedList", "taskList"):
        return _list_to_markdown(node, indent)
    if node_type == "table":
        return _table_to_markdown(node, indent)
    if node_type == "attachment":
        name = attrs.get("fileName") or "attachment"
        return _prefix(f"[{_escape(name)}](gigsnano:file/{attrs.get('fileId')})", indent)
    if node_type == "image":
        return _prefix(_inline_to_markdown([node]), indent)
    if node_type == "unknownBlock":
        # Visible and reversible: the raw payload survives a round trip through
        # Markdown so an older client can't quietly delete a newer node.
        raw = attrs.get("raw") or ""
        fence = _fence_for(raw)
        return _prefix(
            f"{fence}{_UNKNOWN_FENCE}\n{raw}\n{fence}", indent, all_lines=False
        )

    # A block we have no serializer for still contributes its text rather than
    # vanishing.
    if content:
        return _blocks_to_markdown(content, indent)
    return ""


def _fence_for(body: str) -> str:
    """Use a longer fence than any backtick run inside, per CommonMark."""
    longest = max((len(m) for m in re.findall(r"`+", body)), default=0)
    return "`" * max(3, longest + 1)


def _prefix(text: str, indent: str, all_lines: bool = True) -> str:
    if not indent:
        return text
    if not all_lines:
        return "\n".join(f"{indent}{line}".rstrip() for line in text.split("\n"))
    return f"{indent}{text}"


def _list_to_markdown(node: dict[str, Any], indent: str) -> str:
    node_type = node["type"]
    # Only real items become bullets. A stray child — whitespace that leaked in
    # from pretty-printed markup, say — would otherwise render as an empty `-`,
    # which is what GIN-270 reported between every item.
    items = [
        item
        for item in (node.get("content") or [])
        if item.get("type") in ("listItem", "taskItem")
    ]
    start = int((node.get("attrs") or {}).get("start") or 1)
    lines: list[str] = []

    for i, item in enumerate(items):
        if node_type == "orderedList":
            bullet = f"{start + i}. "
        elif node_type == "taskList":
            checked = bool((item.get("attrs") or {}).get("checked"))
            bullet = f"- [{'x' if checked else ' '}] "
        else:
            bullet = "- "

        # Continuation lines align under the bullet so nested blocks stay inside
        # the item.
        child_indent = indent + " " * len(bullet)
        body = _item_body_to_markdown(item.get("content") or [], child_indent)
        body = body[len(child_indent) :] if body.startswith(child_indent) else body
        lines.append(f"{indent}{bullet}{body}" if body else f"{indent}{bullet}".rstrip())

    return "\n".join(lines)


_LIST_TYPES = frozenset({"bulletList", "orderedList", "taskList"})


def _item_body_to_markdown(nodes: list[dict[str, Any]], indent: str) -> str:
    """Serialize a list item's blocks, keeping a nested list tight against its parent.

    `_blocks_to_markdown` separates blocks with a blank line, which is right between
    paragraphs but turns a tight nested list into a loose one — and a loose list
    re-parses with its items wrapped in paragraphs, so the round trip wouldn't be a
    fixed point.
    """
    chunks = [(n.get("type"), _block_to_markdown(n, indent)) for n in nodes]
    chunks = [(t, c) for t, c in chunks if c.strip()]
    if not chunks:
        return ""

    out = chunks[0][1]
    for i in range(1, len(chunks)):
        tight = chunks[i][0] in _LIST_TYPES
        out += ("\n" if tight else "\n\n") + chunks[i][1]
    return out


def _table_to_markdown(node: dict[str, Any], indent: str) -> str:
    rows = node.get("content") or []
    if not rows:
        return ""

    rendered: list[list[str]] = []
    header_seen = False
    for row in rows:
        cells = row.get("content") or []
        rendered.append(
            [_inline_to_markdown(_flatten_cell(c)).replace("|", "\\|") for c in cells]
        )
        if not header_seen and any(c.get("type") == "tableHeader" for c in cells):
            header_seen = True

    width = max(len(r) for r in rendered)
    for r in rendered:
        r.extend([""] * (width - len(r)))

    lines = [f"{indent}| " + " | ".join(rendered[0]) + " |"]
    lines.append(f"{indent}| " + " | ".join(["---"] * width) + " |")
    for r in rendered[1:]:
        lines.append(f"{indent}| " + " | ".join(r) + " |")
    return "\n".join(lines)


def _flatten_cell(cell: dict[str, Any]) -> list[dict[str, Any]]:
    """GFM cells hold inline content only; lift paragraph children out."""
    out: list[dict[str, Any]] = []
    for child in cell.get("content") or []:
        if child.get("type") == "paragraph":
            out.extend(child.get("content") or [])
        else:
            out.append(child)
    return out


#: `*` rather than `_` for emphasis, deliberately. CommonMark forbids `_` from
#: opening or closing inside a word, so `beta_x_delta` is literal text while
#: `beta*x*delta` is emphasis. Since a mark can begin mid-word, `_` would silently
#: drop the emphasis on the way back in — which is exactly what the generated-
#: document property test caught.
_MARK_DELIM = {
    "bold": "**",
    "italic": "*",
    "strike": "~~",
}


def _inline_to_markdown(nodes: list[dict[str, Any]]) -> str:
    out: list[str] = []
    for node in nodes:
        prev = out[-1][-1] if out and out[-1] else ""
        out.append(_inline_node_to_markdown(node, prev_char=prev))
    text = "".join(out)
    return _ESCAPE_LINE_START.sub(r"\1\\\2\3", text)


def _inline_node_to_markdown(node: dict[str, Any], prev_char: str = "") -> str:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}
    marks = node.get("marks") or []

    if node_type == "hardBreak":
        return "\\\n"
    if node_type == "mention":
        label = attrs.get("label") or ""
        kind = attrs.get("entityType") or "user"
        return f"[@{_escape(label)}](gigsnano:{kind}/{attrs.get('entityId')})"
    if node_type == "workItemRef":
        code = attrs.get("code") or ""
        return f"[{_escape(code)}](gigsnano:work-item/{attrs.get('workItemId')})"
    if node_type == "attachment":
        name = attrs.get("fileName") or "attachment"
        return f"[{_escape(name)}](gigsnano:file/{attrs.get('fileId')})"
    if node_type == "image":
        alt = _escape(attrs.get("alt") or "")
        src = (
            f"gigsnano:file/{attrs['fileId']}"
            if attrs.get("fileId")
            else (attrs.get("src") or "")
        )
        title = attrs.get("title")
        suffix = f' "{title}"' if title else ""
        return f"![{alt}]({src}{suffix})"
    if node_type != "text":
        return ""

    text = node.get("text") or ""
    mark_types = {m.get("type") for m in marks}

    if "code" in mark_types:
        # Code spans take no inner escaping; the fence length carries the meaning.
        ticks = "`" * (max((len(m) for m in re.findall(r"`+", text)), default=0) + 1)
        pad = " " if text.startswith("`") or text.endswith("`") else ""
        rendered = f"{ticks}{pad}{text}{pad}{ticks}"
    else:
        rendered = _escape(text)

    # Strike innermost, against the letters. GFM's `~~` needs a word character on
    # the inside to open and close: wrapped outside `**`, its delimiters sit
    # between two punctuation marks, fail the flanking rules, and come back as
    # literal `~~`. `*`/`**` have no such restriction, so they go outside.
    #
    # If the previous run ended with `*`, emphasis here would fuse with it into a
    # single ambiguous `***` delimiter run. `_`/`__` are only restricted *inside a
    # word*, and a `*` boundary is punctuation, so they are safe precisely where
    # `*` is not.
    underscore = prev_char == "*"
    for mark_type in ("strike", "italic", "bold"):
        if mark_type in mark_types and text.strip():
            delim = _MARK_DELIM[mark_type]
            if underscore and delim == "*":
                delim = "_"
            elif underscore and delim == "**":
                delim = "__"
            rendered = f"{delim}{rendered}{delim}"

    # `underline` has no Markdown representation and is dropped here — a
    # documented lossy mark (ADR 0001, lossyOnMarkdownExport).

    for mark in marks:
        if mark.get("type") == "link":
            href = (mark.get("attrs") or {}).get("href") or ""
            rendered = f"[{rendered}]({href})"
            break

    return rendered


def _escape(text: str) -> str:
    return _ESCAPE_INLINE.sub(r"\\\1", text)
