"""Minimal Markdown → HTML for the distilled task description (finalize-description).

Deliberately a SMALL subset — headings, unordered/ordered lists, paragraphs, and
inline bold/italic/code — because `story.description` is rendered by the frontend
TipTap editor which only needs clean semantic HTML for those nodes. This is not a
general Markdown engine; the extraction instruction constrains the model to this
subset. Text is HTML-escaped before inline formatting, so model output cannot
inject markup.
"""

import re

_HEADING = re.compile(r"(#{1,6})\s+(.*)$")
_UL = re.compile(r"[-*+]\s+(.*)$")
_OL = re.compile(r"\d+\.\s+(.*)$")
_CODE = re.compile(r"`([^`]+?)`")
_BOLD = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")
_ITALIC = re.compile(r"\*(.+?)\*|_(.+?)_")


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline(text: str) -> str:
    """Escape then apply inline formatting. Code spans are stashed to placeholders first
    so bold/italic (esp. intraword underscores in snake_case identifiers like
    `find_api_flow`) never reformat their contents."""
    out = _escape(text)
    codes: list[str] = []

    def _stash(m: re.Match) -> str:
        codes.append(m.group(1))
        return f"\x00{len(codes) - 1}\x00"

    out = _CODE.sub(_stash, out)
    out = _BOLD.sub(lambda m: f"<strong>{m.group(1) or m.group(2)}</strong>", out)
    out = _ITALIC.sub(lambda m: f"<em>{m.group(1) or m.group(2)}</em>", out)
    for i, code in enumerate(codes):
        out = out.replace(f"\x00{i}\x00", f"<code>{code}</code>")
    return out


# Opening tag of a known HTML element, anchored at the START of the text — that is
# what distinguishes a caller sending HTML (the frontend TipTap editor always emits a
# block element first) from one sending Markdown. A fixed tag list so a stray "a < b"
# in prose isn't mistaken for HTML.
#
# Anchoring matters: searching ANYWHERE (GIN-134) misread any Markdown that merely
# *mentions* a tag — `<p>` inside a code span, JSX in a fenced block — as HTML, and
# passed it through unconverted, so it rendered as literal `##` and `**`. Prose about
# markup is common in a tracker; prose that *opens* with a tag is not.
_HTML_TAG = re.compile(
    r"</?(?:p|div|span|ul|ol|li|h[1-6]|strong|b|em|i|u|s|code|pre|blockquote|br|hr|a|img"
    r"|table|thead|tbody|tr|td|th)\b",
    re.I,
)


def markdown_or_html_to_html(text: str) -> str:
    """Convert Markdown to HTML, but pass input that ALREADY starts with an HTML tag
    through unchanged. Rich-text write paths store HTML (the frontend TipTap editor
    renders it, dropping any tag outside its schema); running HTML back through the
    Markdown converter would HTML-escape its tags into visible `<p>` text (GIN-117)."""
    return text if _HTML_TAG.match(text.lstrip()) else markdown_to_html(text)


def markdown_to_html(md: str) -> str:
    """Convert a small Markdown subset to HTML. Always returns at least `<p></p>`."""
    lines = md.replace("\r\n", "\n").split("\n")
    html: list[str] = []
    para: list[str] = []
    list_items: list[str] = []
    list_tag: str | None = None

    def flush_para() -> None:
        nonlocal para
        if para:
            html.append(f"<p>{_inline(' '.join(para))}</p>")
            para = []

    def flush_list() -> None:
        nonlocal list_items, list_tag
        if list_items:
            items = "".join(f"<li>{_inline(it)}</li>" for it in list_items)
            html.append(f"<{list_tag}>{items}</{list_tag}>")
            list_items = []
            list_tag = None

    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            flush_para()
            flush_list()
            continue
        heading = _HEADING.match(stripped)
        ul = _UL.match(stripped)
        ol = _OL.match(stripped)
        if heading:
            flush_para()
            flush_list()
            level = min(len(heading.group(1)), 6)
            html.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
        elif ul:
            flush_para()
            if list_tag not in (None, "ul"):
                flush_list()
            list_tag = "ul"
            list_items.append(ul.group(1))
        elif ol:
            flush_para()
            if list_tag not in (None, "ol"):
                flush_list()
            list_tag = "ol"
            list_items.append(ol.group(1))
        else:
            flush_list()
            para.append(stripped)

    flush_para()
    flush_list()
    return "".join(html) or "<p></p>"
