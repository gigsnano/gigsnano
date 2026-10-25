"""Legacy HTML -> canonical JSON. The one place an HTML parser belongs.

GIN-308. Everything else in this package treats HTML as a derived output, and
`content/fields.py` deliberately refuses to canonicalise HTML on the write path —
a permanent HTML parser in the write path would be a second lossy front door for
the format we are demoting.

A *migration* is different. It runs once per row, against markup our own editor
produced, and its output is reviewed before anything reads it. So the parser
lives here, is used by the backfill and nothing else, and can be deleted the day
the last legacy row is converted.

Scope is set by what TipTap actually emits (see the ADR's measured baseline),
plus enough tolerance for hand-written and agent-written markup that predates the
editor. Anything unrecognised is *unwrapped* — its children are kept and only the
tag is dropped — because for a migration, losing a wrapper is recoverable and
losing a paragraph of someone's writing is not.
"""

from __future__ import annotations

from html.parser import HTMLParser
from typing import Any

from .schema import ContentError, validate_doc

# Block elements, mapped to the node they become.
_BLOCKS = {
    "p": "paragraph",
    "blockquote": "blockquote",
    "ul": "bulletList",
    "ol": "orderedList",
    "li": "listItem",
    "table": "table",
    "tr": "tableRow",
    "td": "tableCell",
    "th": "tableHeader",
}

_HEADINGS = {f"h{i}": i for i in range(1, 7)}

#: Blocks that cannot contain one another, so opening one implicitly closes the
#: last. HTML does this for you; a hand-rolled parser has to be told.
_AUTOCLOSES_P = {"p", *_HEADINGS}

#: Nodes that hold inline content directly. Anything else treats whitespace
#: between its children as formatting rather than text.
_INLINE_CONTAINERS = {"paragraph", "heading"}

#: Nodes whose ProseMirror schema requires block children, so bare inline content
#: inside them has to be wrapped in a paragraph.
_NEEDS_BLOCK_CHILD = {
    "listItem", "taskItem", "blockquote", "tableCell", "tableHeader",
}

# Inline formatting, mapped to the mark it becomes. Both the semantic and the
# presentational spellings, since legacy content has both.
_MARKS = {
    "strong": "bold",
    "b": "bold",
    "em": "italic",
    "i": "italic",
    "s": "strike",
    "del": "strike",
    "strike": "strike",
    "u": "underline",
    "ins": "underline",
}

# Dropped entirely, contents included — the only tags whose text is never content.
#
# Deliberately just these two. `head`/`title`/`noscript` were here first, and a
# real prod comment containing the literal text `<title>` (raw Markdown left in an
# HTML column by GIN-134) made the parser skip to a closing tag that never came,
# swallowing the rest of the comment. Prose mentioning a tag name is far more
# likely in a work tracker than an actual document head inside a description, and
# an unclosed skip is unbounded — it costs the whole remainder of the field.
_VOID_OF_CONTENT = {"script", "style"}

# Structural wrappers with no node of their own; their children belong to the
# enclosing block.
_TRANSPARENT = {
    "tbody", "thead", "tfoot", "colgroup", "col", "html", "body", "label",
    "head", "title", "noscript",
}


class _Importer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root: dict[str, Any] = {"type": "doc", "content": []}
        self._stack: list[dict[str, Any]] = [self.root]
        self._marks: list[dict[str, Any]] = []
        self._skip_depth = 0
        #: Tags we opened as blocks, so end tags can be matched without assuming
        #: the document is well-formed. Legacy HTML frequently isn't.
        self._open: list[str] = []

    # --- helpers ---

    def _parent(self) -> dict[str, Any]:
        return self._stack[-1]

    def _append(self, node: dict[str, Any]) -> None:
        self._parent().setdefault("content", []).append(node)

    def _push(self, tag: str, node: dict[str, Any]) -> None:
        node.setdefault("content", [])
        self._append(node)
        self._stack.append(node)
        self._open.append(tag)

    def _pop_to(self, tag: str) -> None:
        """Close `tag`, tolerating unclosed inner tags rather than desyncing."""
        if tag not in self._open:
            return
        while self._open:
            closed = self._open.pop()
            self._stack.pop()
            if closed == tag:
                return

    def _autoclose(self, tag: str) -> None:
        """Apply HTML's own implicit end tags before opening `tag`.

        `<p>one<p>two` is two sibling paragraphs, not a nested one — a browser
        closes the open `<p>` for you. Legacy content is full of these, and
        without this the tree nests forever and the text comes out in the wrong
        order.
        """
        if tag not in _AUTOCLOSES_P:
            return
        for open_tag in reversed(self._open):
            if open_tag in _AUTOCLOSES_P:
                self._pop_to(open_tag)
                return
            if open_tag in _BLOCKS or open_tag == "pre":
                return  # a new block context; nothing to close

    def _inline_target(self) -> dict[str, Any]:
        """Text needs an enclosing block; legacy fragments often start bare.

        Also covers `<li>text</li>` and `<td>text</td>`, which are legal HTML but
        whose ProseMirror equivalents require *block* children. Left unwrapped,
        `listItem > text` is an invalid document: it renders back to HTML by luck,
        serializes to an empty list item, and would be rejected by the editor.
        """
        parent = self._parent()
        if parent is self.root or parent.get("type") in _NEEDS_BLOCK_CHILD:
            block = {"type": "paragraph", "content": []}
            self._append(block)
            self._stack.append(block)
            self._open.append("p")
        return self._parent()

    # --- parser callbacks ---

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {k: (v or "") for k, v in attrs}

        if tag in _VOID_OF_CONTENT:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in _TRANSPARENT:
            return

        if tag == "br":
            self._inline_target()
            self._append({"type": "hardBreak"})
            return
        if tag == "hr":
            self._append({"type": "horizontalRule"})
            return
        if tag == "img":
            self._inline_target()
            self._image(attr)
            return

        # Marks never touch the node stack — only `_marks`. They used to push a
        # placeholder onto `_stack` to "keep the stacks in step", but
        # `_inline_target` also pushes (a wrapper paragraph inside a list item),
        # so `</strong>` popped that paragraph instead of its own entry and the
        # rest of the item started a new one. `<li><b>Tabs</b> or x</li>` came out
        # as two paragraphs, which serialises as a broken list item.
        if tag in _MARKS:
            self._marks.append({"type": _MARKS[tag]})
            return
        if tag == "a":
            self._marks.append({"type": "link", "attrs": {"href": attr.get("href", "")}})
            return
        if tag == "code":
            # <pre><code> is a block; a bare <code> is an inline mark.
            if "pre" in self._open:
                # TipTap puts the language on the <code>, not the <pre>, so the
                # enclosing codeBlock only learns it here.
                language = _language_of(attr)
                if language:
                    self._parent().setdefault("attrs", {})["language"] = language
                return
            self._marks.append({"type": "code"})
            return

        if tag == "pre":
            language = _language_of(attr)
            node: dict[str, Any] = {"type": "codeBlock"}
            if language:
                node["attrs"] = {"language": language}
            self._push(tag, node)
            return

        if tag in _HEADINGS:
            self._autoclose(tag)
            self._push(tag, {"type": "heading", "attrs": {"level": _HEADINGS[tag]}})
            return

        if tag == "ul":
            # TipTap marks task lists on the list; without that a `<ul>` is a
            # plain bullet list even if its items happen to carry checkboxes.
            is_task = attr.get("data-type") == "taskList"
            self._push(tag, {"type": "taskList" if is_task else "bulletList"})
            return

        if tag == "li":
            in_task = any(n.get("type") == "taskList" for n in self._stack)
            if in_task:
                checked = attr.get("data-checked") == "true"
                self._push(tag, {"type": "taskItem", "attrs": {"checked": checked}})
            else:
                self._push(tag, {"type": "listItem"})
            return

        if tag == "input":
            return  # the task checkbox; its state came from the <li>

        if tag == "mention-component":
            self._mention(attr)
            return
        if tag == "work-item-ref":
            self._append(
                {
                    "type": "workItemRef",
                    "attrs": {
                        "workItemId": attr.get("data-work-item-id") or None,
                        "code": attr.get("data-code", ""),
                        "title": "",
                    },
                }
            )
            return
        if tag == "attachment-ref":
            self._append(
                {
                    "type": "attachment",
                    "attrs": {
                        "fileId": attr.get("data-file-id") or None,
                        "fileName": "",
                        "mimeType": attr.get("data-mime-type") or None,
                        "size": None,
                    },
                }
            )
            return

        if tag == "div" and "data-unknown-node" in attr:
            self._append(
                {
                    "type": "unknownBlock",
                    "attrs": {
                        "originalType": attr.get("data-original-type", "unknown"),
                        "raw": attr.get("data-raw", ""),
                    },
                }
            )
            return

        if tag in _BLOCKS:
            self._autoclose(tag)
            node = {"type": _BLOCKS[tag]}
            if tag == "ol" and attr.get("start", "").isdigit():
                node["attrs"] = {"start": int(attr["start"])}
            self._push(tag, node)
            return

        # Unrecognised: unwrap. Keep the children, drop the tag — for a migration,
        # losing a wrapper is recoverable, losing someone's writing is not.

    def handle_endtag(self, tag: str) -> None:
        if tag in _VOID_OF_CONTENT:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth or tag in _TRANSPARENT:
            return
        if tag in ("br", "hr", "img", "input"):
            return

        # `</code>` is always treated as a mark close. Inside <pre> no code mark
        # was ever opened, so removing one is a no-op — whereas gating on the
        # open-tag stack (which marks no longer touch) left the mark open and
        # bled `code` onto every following character.
        if tag in _MARKS or tag in ("a", "code"):
            wanted = (
                "link"
                if tag == "a"
                else "code"
                if tag == "code"
                else _MARKS.get(tag, "")
            )
            for i in range(len(self._marks) - 1, -1, -1):
                if self._marks[i]["type"] == wanted:
                    del self._marks[i]
                    break
            return

        if tag in ("mention-component", "work-item-ref", "attachment-ref"):
            return

        self._pop_to(tag)

    def handle_data(self, data: str) -> None:
        if self._skip_depth or not data:
            return

        parent = self._parent()
        if parent.get("type") == "codeBlock":
            # Whitespace is content inside a code block.
            parent.setdefault("content", []).append({"type": "text", "text": data})
            return

        # Between blocks, HTML whitespace is formatting, not content. Only nodes
        # that actually hold inline content may keep it.
        #
        # Pretty-printed markup puts a newline between `</li>` and `<li>`. Left
        # alone that lands as a text node *inside the list*, and the serializer
        # counts every child of a list as an item — which is where GIN-270's
        # phantom `-` bullets between every real item came from.
        if not data.strip() and parent.get("type") not in _INLINE_CONTAINERS:
            return

        target = self._inline_target()
        node: dict[str, Any] = {"type": "text", "text": data}
        if self._marks:
            node["marks"] = [dict(m) for m in self._marks]
        # A mention's label is written between its tags; fold it into the node
        # rather than leaving it as loose text beside the atom.
        content = target.setdefault("content", [])
        if content and content[-1].get("type") == "mention" and not self._marks:
            if not content[-1]["attrs"].get("label"):
                content[-1]["attrs"]["label"] = data.strip().lstrip("@")
                return
        if content and content[-1].get("type") == "attachment" and not self._marks:
            if not content[-1]["attrs"].get("fileName"):
                content[-1]["attrs"]["fileName"] = data.strip()
                return
        if content and content[-1].get("type") == "workItemRef" and not self._marks:
            if not content[-1]["attrs"].get("code"):
                content[-1]["attrs"]["code"] = data.strip()
                return
        content.append(node)

    # --- atoms ---

    def _image(self, attr: dict[str, str]) -> None:
        self._append(
            {
                "type": "image",
                "attrs": {
                    "fileId": None,
                    "src": attr.get("src") or None,
                    "alt": attr.get("alt") or None,
                    "title": attr.get("title") or None,
                },
            }
        )

    def _mention(self, attr: dict[str, str]) -> None:
        entity_name = attr.get("entity_name", "user_mention")
        self._inline_target()
        self._append(
            {
                "type": "mention",
                "attrs": {
                    "entityId": attr.get("entity_identifier") or attr.get("id") or None,
                    "entityType": "team" if entity_name.startswith("team") else "user",
                    "label": "",
                },
            }
        )



def _language_of(attr: dict[str, str]) -> str | None:
    """`<pre><code class="language-x">` is where TipTap puts the language."""
    for value in (attr.get("class", ""), attr.get("data-language", "")):
        for token in value.split():
            if token.startswith("language-"):
                return token[len("language-") :] or None
        if value and not value.startswith("language-") and " " not in value:
            return value or None
    return None


def html_to_doc(html: str) -> dict[str, Any]:
    """Convert legacy HTML into a validated canonical document.

    Migration-only — do not wire this into a write path. `content/fields.py`
    refuses HTML on purpose, and that refusal is the design, not a gap.
    """
    if not isinstance(html, str):
        raise ContentError("html input must be a string")

    importer = _Importer()
    importer.feed(html)
    importer.close()

    doc = importer.root
    if not doc.get("content"):
        doc = {"type": "doc", "content": [{"type": "paragraph"}]}
    return validate_doc(doc)
