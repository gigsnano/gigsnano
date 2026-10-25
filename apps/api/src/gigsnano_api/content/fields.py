"""The dual-write / dual-read seam for canonical content fields.

GIN-300. Every rich-text field gains a `*_json` column holding the canonical
document; the original column keeps a derived HTML rendering. Two independent
flags gate the transition, so write can be switched on and soaked long before
anything reads it:

    content_json_write   writers populate `*_json` alongside the HTML column
    content_json_read    readers prefer `*_json` over the HTML column

Turning `content_json_read` off restores exact prior behaviour with no data
movement, because the HTML column is maintained throughout. That is the rollback
boundary ADR 0001 section 9 commits to, and it is why the legacy columns are not
dropped anywhere in GIN-297.

One asymmetry is deliberate and worth stating plainly: **HTML input cannot be
canonicalised here.** There is no HTML -> JSON parser, by design — writing one
would be a second lossy parser for a format we are trying to stop treating as
truth. The frontend editor still sends HTML today, so its writes leave `*_json`
NULL and readers fall through to the HTML column. Agent and MCP writes, which
send Markdown, canonicalise immediately. Existing HTML is converted once, in
bulk, by GIN-308. Until then a NULL `*_json` is the normal, correct state for
editor-authored content, not a failure.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from .html import doc_to_html
from .markdown import markdown_to_doc
from .schema import ContentError, empty_doc, make_envelope, parse_envelope, validate_doc
from .text import doc_to_text, html_to_text

logger = logging.getLogger(__name__)

#: What a caller says it is sending. Never inferred from the content itself —
#: that inference is the bug class GIN-117 and GIN-134 each patched once.
ContentFormat = Literal["json", "markdown", "html"]

CONTENT_FORMATS: frozenset[str] = frozenset({"json", "markdown", "html"})


@dataclass(frozen=True)
class ContentWrite:
    """The values to persist for one content field.

    `json` is None whenever the canonical form could not be produced — flag off,
    HTML input, or a conversion failure. `error` says which, and is None on the
    ordinary flag-off and HTML paths so that "no JSON" and "JSON went wrong" are
    never confused in the telemetry.
    """

    html: str
    json: dict[str, Any] | None
    text: str
    error: str | None = None

    @property
    def canonical(self) -> bool:
        return self.json is not None


@dataclass(frozen=True)
class ContentRead:
    """A resolved content field plus where it came from."""

    html: str
    doc: dict[str, Any] | None
    origin: Literal["json", "legacy-html", "empty"]
    error: str | None = None


def parse_content_format(value: str | None, *, default: ContentFormat) -> ContentFormat:
    """Validate a caller-supplied format, defaulting explicitly per call site.

    The default belongs to the caller, not to this function: the HTTP API's
    editor-facing routes default to `html` for backwards compatibility, while MCP
    and agent tools default to `markdown` because that is what models emit.
    """
    if value is None:
        return default
    if value not in CONTENT_FORMATS:
        raise ContentError(
            f"unknown content_format {value!r}; expected one of "
            f"{', '.join(sorted(CONTENT_FORMATS))}"
        )
    return value  # type: ignore[return-value]


def build_content(
    value: str | dict[str, Any] | None,
    *,
    content_format: ContentFormat,
    write_json: bool,
    source: str = "editor",
) -> ContentWrite:
    """Turn one caller-supplied value into the columns to persist.

    **A write that cannot produce a canonical copy clears the old one.** That is
    the load-bearing rule here, and it is the opposite of what it looks like it
    should be.

    The tempting design is to keep the previous canonical value when the new one
    can't be built, so a failure "only" leaves the copy stale. But the HTML column
    always receives the new value, so a stale canonical copy plus
    `content_json_read` means the reader is served the *old* text — the user's
    edit silently vanishes. NULL is not data loss: it falls back to the HTML
    column, which holds exactly what the user just wrote.

    This matters most on the ordinary path, not the error path: the editor sends
    HTML, HTML is deliberately not canonicalisable here, so every editor save
    must clear the canonical copy until the editor emits JSON (GIN-301).

    Nothing raises. A content field failing to canonicalise must not fail the
    user's save, because the HTML column is always written correctly.
    """
    if value is None or value == "":
        return ContentWrite(html="", json=None, text="")

    if not write_json:
        # Flag off: behave exactly as before. Not an error.
        return ContentWrite(
            html=_as_html(value, content_format),
            json=None,
            text="",
        )

    if content_format == "html":
        # Expected, not exceptional — see the module docstring. json=None clears
        # any previous canonical copy, which is what keeps reads truthful.
        return ContentWrite(html=str(value), json=None, text="")

    try:
        # Rendering is inside the try as well as parsing: this function must not
        # raise, or a malformed content field would fail the whole save.
        doc = _to_doc(value, content_format)
        return ContentWrite(
            html=doc_to_html(doc),
            json=make_envelope(doc, source=source),
            text=doc_to_text(doc),
        )
    except ContentError as exc:
        logger.warning("content canonicalisation failed (%s): %s", content_format, exc)
        return ContentWrite(
            html=_as_html(value, content_format),
            json=None,
            text="",
            error=str(exc),
        )


def read_content(
    json_value: dict[str, Any] | None,
    legacy_html: str | None,
    *,
    read_json: bool,
) -> ContentRead:
    """Resolve a content field, preferring canonical JSON when the flag allows.

    Precedence is deterministic and never sniffs: JSON if present and readable,
    otherwise the HTML column, otherwise empty. A document written by a newer
    schema version is *not* an error to the reader — it falls back to the derived
    HTML, which is exactly what ADR 0001 section 7 requires so a rollback window
    cannot truncate newer content.
    """
    if read_json and json_value:
        try:
            doc = parse_envelope(json_value)
            return ContentRead(html=doc_to_html(doc), doc=doc, origin="json")
        except ContentError as exc:
            logger.warning("falling back to legacy HTML: %s", exc)
            if legacy_html:
                return ContentRead(
                    html=legacy_html, doc=None, origin="legacy-html", error=str(exc)
                )
            return ContentRead(html="", doc=None, origin="empty", error=str(exc))

    if legacy_html:
        return ContentRead(html=legacy_html, doc=None, origin="legacy-html")
    return ContentRead(html="", doc=None, origin="empty")


# --- divergence -------------------------------------------------------------


@dataclass(frozen=True)
class Divergence:
    """One row whose derived HTML disagrees with its stored HTML column."""

    identifier: str
    field: str
    stored_html: str
    derived_html: str


def divergence_of(
    identifier: str,
    field: str,
    json_value: dict[str, Any] | None,
    legacy_html: str | None,
) -> Divergence | None:
    """Report when a row's canonical copy no longer *says* what its HTML says.

    The measurement GIN-305 dashboards. Deliberately a pure function over a row
    rather than a background job writing a metrics table: divergence is only
    meaningful against content, so it is cheapest to compute where the content
    already is — in a query, a migration audit, or an admin endpoint.

    **Compares text, not markup.** Markup differences are expected by design: we
    render from a schema, so bare text gains a `<p>` wrapper, links gain `rel`,
    attribute order settles. Measuring bytes reported 65% of backfilled prod rows
    as divergent when only 0.5% differed in a single word — a dashboard nobody
    could act on. What matters is whether the document changed meaning.

    Returns None when the content agrees, when there is no canonical copy, or
    when the JSON cannot be read (a read-fallback event, not a divergence).
    """
    if not json_value:
        return None
    try:
        derived = doc_to_html(parse_envelope(json_value))
    except ContentError:
        return None

    stored = (legacy_html or "").strip()
    if html_to_text(stored) == html_to_text(derived):
        return None
    return Divergence(
        identifier=identifier, field=field, stored_html=stored, derived_html=derived
    )


# --- internals --------------------------------------------------------------


def _to_doc(value: str | dict[str, Any], content_format: ContentFormat) -> dict[str, Any]:
    if content_format == "markdown":
        if not isinstance(value, str):
            raise ContentError("markdown content must be a string")
        return markdown_to_doc(value)

    if content_format == "json":
        if isinstance(value, str):
            import json as _json

            try:
                value = _json.loads(value)
            except ValueError as exc:
                raise ContentError(f"content is not valid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise ContentError("json content must be an object")
        # Accept either a full envelope or a bare doc, so a client that already
        # has a ProseMirror doc doesn't have to learn the envelope to send one.
        if value.get("schema"):
            return parse_envelope(value)
        if value.get("type") != "doc":
            raise ContentError(f"json content must be a doc node, got {value.get('type')!r}")
        return validate_doc(value)

    raise ContentError(f"cannot canonicalise {content_format} content")


def _as_html(value: str | dict[str, Any], content_format: ContentFormat) -> str:
    """The HTML column's value when we are not going through the canonical path."""
    if content_format == "markdown" and isinstance(value, str):
        try:
            return doc_to_html(markdown_to_doc(value))
        except ContentError:
            return value
    if content_format == "json":
        try:
            return doc_to_html(_to_doc(value, "json"))
        except ContentError:
            return ""
    return str(value)


def empty_envelope(source: str = "editor") -> dict[str, Any]:
    """A canonical empty document, for columns that must be non-NULL."""
    return make_envelope(empty_doc(), source=source)
