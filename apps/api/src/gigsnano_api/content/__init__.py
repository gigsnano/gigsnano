"""Canonical structured content: versioned ProseMirror JSON in, everything else out.

The single conversion library for GIN-297. Markdown, HTML and plain text are all
*derived* from the canonical JSON document; none is ever parsed back as truth.

    from gigsnano_api import content

    doc = content.markdown_to_doc("## Hello\\n\\n- [x] done")
    envelope = content.make_envelope(doc, source="agent")   # persist this
    html = content.doc_to_html(doc)                          # derived column
    text = content.doc_to_text(doc)                          # search projection
    md = content.doc_to_markdown(doc)                        # agent / MCP reads

Callers state the format; nothing here sniffs. `markdown_or_html_to_html` in
bmad/markdown_html.py is the guess this replaces — see ADR 0001 section 1 and the
GIN-117 / GIN-134 history it accumulated.

The frontend does not use this module. Once JSON is canonical TipTap consumes it
natively, so conversion is only needed where a non-JSON peer exists (agents,
legacy readers, search) — all of which are server-side. A parallel TypeScript
implementation would recreate exactly the Python/TS divergence that left the TS
MCP server converting nothing.
"""

from .html import doc_to_html
from .markdown import doc_to_markdown, markdown_to_doc
from .schema import (
    ALLOWED_LINK_SCHEMES,
    MARKS,
    NODES,
    SCHEMA_NAME,
    SCHEMA_VERSION,
    ContentError,
    empty_doc,
    is_empty,
    link_scheme_ok,
    make_envelope,
    parse_envelope,
    parse_gigsnano_uri,
    validate_doc,
)
from .text import doc_to_text

__all__ = [
    "ALLOWED_LINK_SCHEMES",
    "MARKS",
    "NODES",
    "SCHEMA_NAME",
    "SCHEMA_VERSION",
    "ContentError",
    "doc_to_html",
    "doc_to_markdown",
    "doc_to_text",
    "empty_doc",
    "is_empty",
    "link_scheme_ok",
    "make_envelope",
    "markdown_to_doc",
    "parse_envelope",
    "parse_gigsnano_uri",
    "validate_doc",
]
