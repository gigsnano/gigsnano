"""Constants and helpers shared by the MCP tool modules.

Every bound here (batch caps, context caps, the Markdown default) is a contract
the tool descriptions state, so it lives in one place rather than per module.
"""

import re
from urllib.parse import urlencode

from gigsnano_api.mcp_server.api import (
    api,
)

# Each code costs one request, so a batch is bounded rather than fanning out freely.
MAX_BULK_CODES = 50
# The API clamps pages here anyway; asking for more just gets silently clamped.
MAX_PAGE = 200
# The ChatGPT connector contract has no paging, so one page has to be a useful
# answer on its own without flooding the model's context.
CONNECTOR_RESULTS = 20

# get_work_item_context bounds (GIN-369): a section is capped so one call stays
# within a predictable response-size/latency budget; the collection reports
# truncation so the caller knows to page a focused tool for the rest.
CONTEXT_DEFAULT_INCLUDES = ("parent", "children", "relations", "links", "comments", "project")
CONTEXT_OPTIONAL_INCLUDES = ("documents", "runs", "options", "routing")
CONTEXT_ALL_INCLUDES = CONTEXT_DEFAULT_INCLUDES + CONTEXT_OPTIONAL_INCLUDES
MAX_CONTEXT_ITEMS = 100
MAX_CONTEXT_COMMENTS = 10  # most-recent tail; older comments come from list_comments


def _collection(items: list, cap: int = MAX_CONTEXT_ITEMS) -> dict:
    """Bounded section envelope for the context tool: total/returned/truncated so a
    caller never mistakes a capped list for the whole set (GIN-369)."""
    window = items[:cap]
    return {
        "total": len(items),
        "returned": len(window),
        "truncated": len(items) > cap,
        "items": window,
    }


def _with_query(path: str, **params) -> str:
    """Append non-None params as a query string (mutation-safety controls ride the
    URL, not the JSON body, so they never pollute the create/update payload)."""
    query = urlencode({k: v for k, v in params.items() if v is not None})
    return f"{path}?{query}" if query else path


#: Every MCP rich-text field is Markdown unless the caller says otherwise. Models
#: emit Markdown, so making that the stated default is what removes the guess.
#:
#: This server no longer converts anything — it declares the format and the API
#: converts (GIN-304). That deleted the sniffing helper this module used to carry,
#: whose anchored-regex guess was patched once for GIN-117 and again for GIN-134.
#: A format the caller states cannot be misdetected.
DEFAULT_CONTENT_FORMAT = "markdown"

#: Appended to every rich-text tool description, because the contract is only
#: useful if the agent can see it — the old one lived in a Python docstring the
#: model never read.
_FORMAT_NOTE = (
    " Rich text is **Markdown** by default (CommonMark + GFM tables, task lists, "
    "fenced code, and ```mermaid diagrams). Pass content_format='html' to send raw "
    "HTML, or 'json' for canonical TipTap JSON. The format is never guessed from the "
    "content, so Markdown that mentions HTML tags is safe."
)


async def _resolve_story(slug: str, code: str, content_format: str = "html") -> dict:
    """Resolve a code to its story.

    `content_format` is a *preference*: Markdown is served only when the row has a
    canonical copy to render from, and the response's own `content_format` field
    reports what actually came back. Internal callers that only need ids keep the
    default, since rendering a description they will not read is wasted work.
    """
    query = f"?content_format={content_format}" if content_format != "html" else ""
    return await api("GET", f"/workspaces/{slug}/stories/resolve/{code}{query}")


async def _resolve_parent_id(slug: str, parent: str | None, parent_id: str | None) -> str | None:
    """Turn a parent work-item *code* into its id (GIN-348).

    Explicit `parent_id` (UUID) wins. A `parent` code is resolved server-side;
    an unresolvable code raises (via `_resolve_story`) rather than silently
    dropping the link — silent-drop was the bug this fixes.
    """
    if parent_id:
        return parent_id
    if parent:
        return (await _resolve_story(slug, parent))["id"]
    return None


def _summarize(s: dict) -> dict:
    """The fields worth listing — full bodies would drown the caller's context.

    `sub_issue_count` earns its place: without it, spotting which rows are epics
    with children costs a get_work_item per row.
    """
    out = {
        "code": s["code"],
        "title": s["title"],
        "status": s["status"],
        "priority": s["priority"],
        "type": s.get("type"),
        "assignee_id": s.get("assignee_id"),
    }
    if s.get("sub_issue_count"):
        out["sub_issue_count"] = s["sub_issue_count"]
    return out


_TAG_RE = re.compile(r"<[^>]+>")


def _plain(value: str | None) -> str:
    """Strip tags so a highlight is sanitized text, never raw HTML (GIN-365)."""
    return _TAG_RE.sub(" ", value or "").replace("\xa0", " ").strip()


def _highlight(terms: list[str], field: str, width: int = 120) -> str | None:
    """A short plain-text snippet around the first term found in `field`."""
    low = field.lower()
    for term in terms:
        idx = low.find(term)
        if idx != -1:
            start = max(0, idx - 30)
            end = min(len(field), start + width)
            snippet = field[start:end].strip()
            return ("…" if start > 0 else "") + snippet + ("…" if end < len(field) else "")
    return None


def _match_evidence(q: str, s: dict) -> dict:
    """Explain a search hit (GIN-365): which fields matched, a coarse relevance
    score mirroring the backend rank tiers, and a sanitized highlight — so the
    agent sees *why* an item ranked where it did and never sniffs raw HTML."""
    ql = q.strip().lower()
    terms = [t for t in ql.split() if t]
    code = (s.get("code") or "").lower()
    title = s.get("title") or ""
    title_l = title.lower()
    desc = _plain(s.get("description"))
    desc_l = desc.lower()

    matched: list[str] = []
    if code and (code == ql or any(t in code for t in terms)):
        matched.append("code")
    if any(t in title_l for t in terms):
        matched.append("title")
    if any(t in desc_l for t in terms):
        matched.append("description")

    if code == ql:
        score = 1.0
    elif title_l == ql:
        score = 0.95
    elif title_l.startswith(ql):
        score = 0.85
    elif ql in title_l:
        score = 0.75
    elif "title" in matched:
        score = 0.6
    elif matched:
        score = 0.45
    else:
        score = 0.2
    return {
        "matched_fields": matched,
        "relevance_score": score,
        "highlight": _highlight(terms, title) or _highlight(terms, desc),
    }

