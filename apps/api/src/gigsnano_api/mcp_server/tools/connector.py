"""The ChatGPT-connector contract: `search` and `fetch`, whose shapes are fixed
by the connector spec rather than by us."""

from urllib.parse import urlencode

from gigsnano_api.core.config import settings
from gigsnano_api.mcp_server.api import TPayload, api, default_workspace, text
from gigsnano_api.mcp_server.server import mcp
from gigsnano_api.mcp_server.tools._shared import (
    CONNECTOR_RESULTS,
    DEFAULT_CONTENT_FORMAT,
    _plain,
    _resolve_story,
)

# ── ChatGPT connector contract: `search` + `fetch` ──────────────────────────
#
# ChatGPT binds MCP connectors through a fixed two-tool contract — a tool literally
# named `search` returning `{"results": [{id, title, url}]}`, and one named `fetch`
# taking an id from those results and returning `{id, title, text, url, metadata}`.
# Our richer `search_work_items` / `fetch_work_items` do not match either the names
# or the shapes, so a standard ChatGPT connector found nothing it could bind.
#
# These are thin aliases over the same endpoints, not a second implementation: the
# `id` is the work-item code, so `fetch` accepts exactly what `search` hands back
# and both stay consistent with every other tool. Clients that can call arbitrary
# tools (Claude Code, ChatGPT developer mode) should keep using the richer pair —
# these deliberately drop ranking evidence, filters and paging to honour the
# contract's fixed shape.


def _story_url(slug: str, story: dict) -> str:
    """Absolute work-item URL when a frontend origin is configured, else a path.

    ChatGPT renders `url` as the citation link, so a bare path would cite nothing
    usable; an unset `frontend_url` (local/dev) degrades to the path rather than
    inventing an origin.
    """
    base = (settings.frontend_url or "").rstrip("/")
    path = f"/{slug}/projects/{story['project_id']}/issues/{story['id']}"
    return f"{base}{path}" if base else path


@mcp.tool(
    description=(
        "Search work items by text and return ranked results as {id, title, url}. "
        "`id` is the work-item code (e.g. 'GIN-309') — pass it to `fetch` to read "
        "the full item. Searches every project you can access in the active "
        "workspace. This is the ChatGPT connector's search entry point; other "
        "clients should prefer search_work_items, which adds filters, paging and "
        "per-hit relevance evidence."
    )
)
async def search(query: str) -> TPayload:
    slug = await default_workspace()
    page = await api(
        "GET", f"/workspaces/{slug}/stories/?{urlencode({'q': query, 'limit': CONNECTOR_RESULTS})}"
    )
    return text(
        {
            "results": [
                {
                    "id": s["code"],
                    "title": f"{s['code']} {s['title']}".strip(),
                    "url": _story_url(slug, s),
                }
                for s in page["items"]
            ]
        }
    )


@mcp.tool(
    description=(
        "Fetch one work item by the `id` returned from `search` (its work-item "
        "code, e.g. 'GIN-309'). Returns the title, the full description as text, "
        "a link, and status/priority/type/assignee metadata. This is the ChatGPT "
        "connector's fetch entry point; other clients should prefer get_work_item "
        "or fetch_work_items (which reads many codes in one call)."
    )
)
async def fetch(id: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, id, DEFAULT_CONTENT_FORMAT)
    body = story.get("description") or ""
    # The API serves Markdown only when the row has a canonical copy; otherwise it
    # returns the stored HTML. ChatGPT expects prose, so tags are stripped rather
    # than shipped raw — same sanitizer the search highlights use.
    if story.get("content_format") != "markdown":
        body = _plain(body)
    return text(
        {
            "id": story["code"],
            "title": story["title"],
            "text": body,
            "url": _story_url(slug, story),
            "metadata": {
                "status": story.get("status"),
                "priority": story.get("priority"),
                "type": story.get("type"),
                "assignee_id": story.get("assignee_id"),
                "project_id": story.get("project_id"),
            },
        }
    )


