"""Canonical document schema — the allow-list, the envelope, and validation.

ADR 0001 (docs/adr/0001-structured-content.md in gigsnano-v2) makes versioned
ProseMirror JSON the canonical content representation. This module is the Python
half of the registry declared there; `docs/adr/structured-content-schema.json` is
the normative source both halves are written against.

The allow-list here is also the sanitizer. Once JSON is canonical there is no HTML
to scrub on the write path: a node type that isn't registered can't be persisted,
an attribute that isn't declared is dropped, and a link scheme outside
ALLOWED_LINK_SCHEMES is stripped. That is strictly tighter than a tag denylist,
because it fails closed on anything we didn't think of.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

SCHEMA_NAME = "gigsnano.doc"
SCHEMA_VERSION = 1

#: Sources recorded in envelope provenance. `html-backfill` is written by GIN-308.
SOURCES = frozenset({"editor", "markdown", "html-backfill", "agent", "import"})

#: `gigsnano:` addresses semantic objects; the rest are ordinary web links.
#: Everything else — `javascript:`, `data:`, `vbscript:`, `file:` — is stripped.
ALLOWED_LINK_SCHEMES = frozenset({"http", "https", "mailto", "gigsnano"})

#: Semantic object kinds addressable as `gigsnano:<kind>/<uuid>`.
GIGSNANO_URI_KINDS = frozenset({"user", "team", "work-item", "file"})


class ContentError(ValueError):
    """Invalid content. Carries a document path so the caller can point at the node.

    Raised only for input we cannot safely interpret. Content we *can* interpret but
    don't recognise is preserved as an unknown node instead — see `validate_doc`.
    """

    def __init__(self, message: str, path: str = "") -> None:
        self.path = path
        super().__init__(f"{message} (at {path or 'doc'})")


# --- registry ---------------------------------------------------------------
#
# attrs map to their default. A node's attrs are exactly these keys: anything else
# on an inbound node is dropped. Identity attrs are called out in the ADR; they are
# not enforced here because a node whose target was deleted must still round-trip
# (that is the whole point of the fallback attrs), so a missing id is a render-time
# `unresolved` state, not a write-time rejection.

_TEXT_CONTAINER: dict[str, Any] = {"content": "inline"}

NODES: dict[str, dict[str, Any]] = {
    "doc": {"content": "block"},
    "paragraph": {"attrs": {"textAlign": None}, **_TEXT_CONTAINER},
    "heading": {"attrs": {"level": 1, "textAlign": None}, **_TEXT_CONTAINER},
    "text": {"leaf": True},
    "hardBreak": {"leaf": True},
    "codeBlock": {"attrs": {"language": None}, "content": "text"},
    "blockquote": {"content": "block"},
    "bulletList": {"content": "block"},
    "orderedList": {"attrs": {"start": 1}, "content": "block"},
    "listItem": {"content": "block"},
    "taskList": {"content": "block"},
    "taskItem": {"attrs": {"checked": False}, "content": "block"},
    "horizontalRule": {"leaf": True},
    "image": {
        "attrs": {"fileId": None, "src": None, "alt": None, "title": None},
        "leaf": True,
    },
    "mention": {
        "attrs": {"entityId": None, "entityType": "user", "label": ""},
        "leaf": True,
        "inline": True,
    },
    "workItemRef": {
        "attrs": {"workItemId": None, "code": "", "title": ""},
        "leaf": True,
        "inline": True,
    },
    "attachment": {
        "attrs": {"fileId": None, "fileName": "", "mimeType": None, "size": None},
        "leaf": True,
    },
    "table": {"content": "block"},
    "tableRow": {"content": "block"},
    "tableCell": {"attrs": {"colspan": 1, "rowspan": 1}, "content": "block"},
    "tableHeader": {"attrs": {"colspan": 1, "rowspan": 1}, "content": "block"},
    "unknownBlock": {"attrs": {"originalType": "", "raw": ""}, "leaf": True},
}

MARKS: dict[str, dict[str, Any]] = {
    "bold": {},
    "italic": {},
    "strike": {},
    "underline": {},
    "code": {},
    "link": {"attrs": {"href": "", "target": None, "rel": None}},
    "unknownMark": {"attrs": {"originalType": "", "raw": ""}},
}

#: Declaration order doubles as canonical mark order — see `_validate_marks`.
_MARK_ORDER = {name: i for i, name in enumerate(MARKS)}

#: Inline-only nodes, for serializers that need to know whether to open a block.
INLINE_NODES = frozenset(
    name for name, spec in NODES.items() if spec.get("inline") or name == "text"
)


# --- envelope ---------------------------------------------------------------


def make_envelope(
    doc: dict[str, Any],
    *,
    source: str = "editor",
    migrated_from: str | None = None,
    migrator: str | None = None,
) -> dict[str, Any]:
    """Wrap a validated doc in the versioned envelope that is persisted verbatim."""
    if source not in SOURCES:
        raise ContentError(f"unknown provenance source {source!r}")

    provenance: dict[str, Any] = {"source": source}
    if migrated_from:
        provenance["migrated_from"] = migrated_from
        # Stamped only on migration so natively-authored documents stay byte-stable
        # across saves — a changing timestamp would make dual-write divergence
        # detection (GIN-305) noisy for content nobody edited.
        provenance["migrated_at"] = datetime.now(timezone.utc).isoformat()
    if migrator:
        provenance["migrator"] = migrator

    return {
        "schema": SCHEMA_NAME,
        "version": SCHEMA_VERSION,
        "doc": doc,
        "provenance": provenance,
    }


def parse_envelope(value: Any) -> dict[str, Any]:
    """Unwrap a stored envelope to its doc, upgrading older versions on read.

    A document at a version we don't support is refused rather than guessed at. The
    caller's contract in that case is to fall back to the derived HTML column
    read-only — never to write, because writing would truncate a newer document
    during a rollback window (ADR 0001 section 7).
    """
    if not isinstance(value, dict):
        raise ContentError("envelope must be an object")
    if value.get("schema") != SCHEMA_NAME:
        raise ContentError(f"unknown schema {value.get('schema')!r}")

    version = value.get("version")
    if not isinstance(version, int):
        raise ContentError("envelope version must be an integer")
    if version > SCHEMA_VERSION:
        raise ContentError(
            f"document schema version {version} is newer than supported "
            f"{SCHEMA_VERSION}; read the derived HTML instead of editing"
        )
    # No upgrade chain yet — v1 is the first version. When v2 lands, apply
    # _UPGRADES[v] in sequence here and leave the result unpersisted until save.

    doc = value.get("doc")
    if not isinstance(doc, dict):
        raise ContentError("envelope is missing its doc")
    return doc


# --- validation / sanitization ----------------------------------------------


def link_scheme_ok(href: str) -> bool:
    """True when `href` is safe to persist and render.

    Scheme-relative (`//host`) and relative (`/path`) URLs carry no scheme and are
    fine. Anything with a scheme must be in the allow-list, which is what keeps
    `javascript:` out. Leading control characters and whitespace are how that check
    is classically bypassed (`java\\tscript:`), so they are stripped before testing.
    """
    if not isinstance(href, str):
        return False
    cleaned = "".join(c for c in href if c.isprintable() and not c.isspace())
    if ":" not in cleaned:
        return True
    scheme, _, rest = cleaned.partition(":")
    # A colon later in a path (`/a/b:c`) isn't a scheme; a real scheme precedes any
    # slash, question mark or hash.
    if any(c in scheme for c in "/?#"):
        return True
    return scheme.lower() in ALLOWED_LINK_SCHEMES and bool(rest)


def parse_gigsnano_uri(href: str) -> tuple[str, str] | None:
    """`gigsnano:work-item/<uuid>` -> `("work-item", "<uuid>")`, else None."""
    if not isinstance(href, str) or not href.startswith("gigsnano:"):
        return None
    kind, _, ident = href[len("gigsnano:") :].partition("/")
    if kind not in GIGSNANO_URI_KINDS or not ident:
        return None
    return kind, ident


def _validate_marks(marks: Any, path: str) -> list[dict[str, Any]]:
    if not isinstance(marks, list):
        return []
    out: list[dict[str, Any]] = []
    for i, mark in enumerate(marks):
        if not isinstance(mark, dict):
            continue
        mark_type = mark.get("type")
        if not isinstance(mark_type, str):
            continue

        spec = MARKS.get(mark_type)
        if spec is None:
            # Preserved, not dropped: an older reader must not silently strip a
            # newer writer's formatting (ADR 0001 section 4.3).
            out.append(
                {
                    "type": "unknownMark",
                    "attrs": {"originalType": mark_type, "raw": _stringify(mark)},
                }
            )
            continue

        clean = {"type": mark_type}
        declared = spec.get("attrs")
        if declared:
            attrs = _clean_attrs(mark.get("attrs"), declared)
            if mark_type == "link" and not link_scheme_ok(attrs.get("href") or ""):
                # Strip the mark, keep the text. Dropping the whole run would lose
                # content to a link the user may not even have authored.
                continue
            clean["attrs"] = attrs
        out.append(clean)

    # Canonical order is registry order. ProseMirror keeps marks in schema order,
    # and two documents that differ only in the order of `italic`+`strike` on the
    # same run are the same document — so equality has to see them as equal.
    out.sort(key=lambda m: _MARK_ORDER.get(m["type"], len(_MARK_ORDER)))
    return out


def _clean_attrs(attrs: Any, declared: dict[str, Any]) -> dict[str, Any]:
    """Keep exactly the declared keys, defaulting whatever is absent."""
    given = attrs if isinstance(attrs, dict) else {}
    return {key: given.get(key, default) for key, default in declared.items()}


def _stringify(value: Any) -> str:
    import json

    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        return repr(value)


def validate_doc(doc: Any, path: str = "doc") -> dict[str, Any]:
    """Coerce arbitrary JSON into a document that satisfies the registry.

    Structurally-broken input raises `ContentError`. Structurally-fine input using
    types we don't know is preserved as `unknownBlock`/`unknownMark`. The
    distinction matters: the first is a bug in the caller, the second is a document
    written by a newer version of us.
    """
    if not isinstance(doc, dict):
        raise ContentError("node must be an object", path)

    node_type = doc.get("type")
    if not isinstance(node_type, str) or not node_type:
        raise ContentError("node is missing its type", path)

    spec = NODES.get(node_type)
    if spec is None:
        return {
            "type": "unknownBlock",
            "attrs": {"originalType": node_type, "raw": _stringify(doc)},
        }

    clean: dict[str, Any] = {"type": node_type}

    if node_type == "text":
        text = doc.get("text")
        if not isinstance(text, str):
            raise ContentError("text node is missing its text", path)
        if not text:
            # ProseMirror forbids empty text nodes; they'd break setContent on the
            # way back into the editor.
            raise ContentError("text node is empty", path)
        clean["text"] = text

    declared = spec.get("attrs")
    if declared:
        attrs = _clean_attrs(doc.get("attrs"), declared)
        if node_type == "heading":
            attrs["level"] = _clamp_level(attrs.get("level"))
        if node_type == "image" and not link_scheme_ok(attrs.get("src") or ""):
            attrs["src"] = None
        clean["attrs"] = attrs

    marks = _validate_marks(doc.get("marks"), path)
    if marks:
        clean["marks"] = marks

    content = doc.get("content")
    if isinstance(content, list):
        children: list[dict[str, Any]] = []
        for i, child in enumerate(content):
            child_path = f"{path}.content[{i}]"
            try:
                children.append(validate_doc(child, child_path))
            except ContentError:
                if node_type == "doc":
                    raise
                # A single unusable child shouldn't cost the user the whole
                # document; drop it and keep its siblings.
                continue
        children = merge_adjacent_text(children)
        children = merge_adjacent_lists(children)
        if children:
            clean["content"] = children

    return clean


_MERGEABLE_LISTS = frozenset({"bulletList", "orderedList", "taskList"})


def merge_adjacent_lists(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fuse sibling lists of the same type into one.

    Markdown cannot express two adjacent lists of the same kind — `- a` blank line
    `- b` is one loose list, not two — and neither can the editor, which merges
    them on input. Canonicalising here keeps JSON and Markdown agreeing on what
    the document is, instead of the difference reappearing on every round trip.
    """
    merged: list[dict[str, Any]] = []
    for node in nodes:
        prev = merged[-1] if merged else None
        node_type = node.get("type")
        if (
            prev is not None
            and node_type in _MERGEABLE_LISTS
            and prev.get("type") == node_type
        ):
            prev.setdefault("content", []).extend(node.get("content") or [])
            continue
        merged.append(node)
    return merged


def merge_adjacent_text(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Join neighbouring text nodes carrying identical marks.

    ProseMirror merges text runs on every transaction, so a document that came
    from the editor never holds an unmerged pair. Enforcing it here makes
    `validate_doc` a true normaliser: two inputs that mean the same thing produce
    the same JSON, which is what lets dual-write divergence detection (GIN-305)
    compare documents by equality instead of by rendering them first.
    """
    merged: list[dict[str, Any]] = []
    for node in nodes:
        prev = merged[-1] if merged else None
        if (
            prev is not None
            and prev.get("type") == "text"
            and node.get("type") == "text"
            and prev.get("marks") == node.get("marks")
        ):
            prev["text"] += node["text"]
            continue
        merged.append(node)
    return merged


def _clamp_level(level: Any) -> int:
    """The editor exposes h1-h3 (rich-editor.tsx:95); Markdown allows h1-h6."""
    if not isinstance(level, int) or isinstance(level, bool):
        return 1
    return min(max(level, 1), 6)


def empty_doc() -> dict[str, Any]:
    """The canonical empty document — one empty paragraph, as TipTap produces."""
    return {"type": "doc", "content": [{"type": "paragraph"}]}


def is_empty(doc: dict[str, Any]) -> bool:
    """True when the document holds no text and no atoms worth rendering."""
    from .text import doc_to_text

    if doc_to_text(doc).strip():
        return False
    return not _has_atom(doc)


_ATOMS = frozenset(
    {"image", "mention", "workItemRef", "attachment", "horizontalRule", "unknownBlock"}
)


def _has_atom(node: dict[str, Any]) -> bool:
    if node.get("type") in _ATOMS:
        return True
    return any(_has_atom(c) for c in node.get("content") or [])
