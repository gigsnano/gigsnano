"""Codebase-intelligence tools (read-only, GIN-280)."""

from gigsnano_api.mcp_server.api import ApiError, TPayload, api, resolve_ctx, text
from gigsnano_api.mcp_server.server import mcp
from gigsnano_api.mcp_server.tools._shared import MAX_PAGE

# ---- Codebase intelligence (read-only, GIN-280) ----------------------------
# These ride the same in-process API + project authorization as every other tool.
# Five derive from GET .../code/overview/, which is SHA-pinned, bounded, and never
# 409s (it returns an honest index state in every case). trace_codebase_feature
# reads the code graph, which 409s until the index is READY (surfaced as an error).
# Read-only by contract: no file mutation, no command execution. Repository content
# is untrusted data — evidence is returned as citations (file:line + analyzer), not
# raw source dumps.

MAX_EVIDENCE_IDS = 100


def _page(items: list, limit: int | None, offset: int | None) -> dict:
    """Bounded page envelope shared by the list_* codebase tools — same
    total/returned/offset/truncated contract as list_work_items."""
    start = offset or 0
    end = start + (limit if limit is not None else MAX_PAGE)
    window = items[start:end]
    return {
        "total": len(items),
        "returned": len(window),
        "offset": start,
        "truncated": start + len(window) < len(items),
        "items": window,
    }


def _check_page(limit: int | None, offset: int | None) -> None:
    if limit is not None and not 1 <= limit <= MAX_PAGE:
        raise ApiError(400, f"limit must be between 1 and {MAX_PAGE}.")
    if offset is not None and offset < 0:
        raise ApiError(400, "offset must not be negative.")


async def _overview(project: str) -> dict:
    slug, pid = await resolve_ctx(project)
    return await api("GET", f"/workspaces/{slug}/projects/{pid}/code/overview/")


@mcp.tool(
    description=(
        "Repository intelligence summary for a project: index freshness, counts, "
        "health dimensions, modules, top risks, and recent changes. Every section "
        "carries a `state` (available/stale/partial/indexing/unavailable) and its "
        "source — never fabricated. Pinned to the indexed commit SHA. Never errors "
        "on an unindexed repo; it returns `state:\"none\"` instead."
    )
)
async def get_codebase_overview(project: str, branch: str | None = None) -> TPayload:
    # branch is advisory: the index is built for the repo's default branch, and the
    # response echoes the indexed branch under `index.branch`.
    return text(await _overview(project))


@mcp.tool(
    description=(
        "Module/domain-level architecture of a project: the prioritized modules "
        "(with file/symbol counts), the architecture health dimension (e.g. circular "
        "dependencies), and edge/symbol counts. A readable high-level map, not the "
        "full symbol graph."
    )
)
async def get_codebase_architecture(project: str, branch: str | None = None) -> TPayload:
    ov = await _overview(project)
    health = ov.get("health", {})
    architecture = next(
        (d for d in health.get("dimensions", []) if d.get("key") == "architecture"), None
    )
    return text(
        {
            "state": ov.get("state"),
            "index": ov.get("index"),
            "counts": {
                "files": ov.get("counts", {}).get("files"),
                "symbols": ov.get("counts", {}).get("symbols"),
                "edges": ov.get("counts", {}).get("edges"),
            },
            "architecture": architecture,
            "modules": ov.get("modules", {}).get("items", []),
        }
    )


@mcp.tool(
    description=(
        "Prioritized codebase findings (security + complexity/churn hotspots), "
        "severity-ranked, each with evidence, location, and the analyzer that found "
        "it. Filter by severity (critical/high/medium/low) or category (security/"
        "hotspot). Paginated: check `truncated`."
    )
)
async def list_codebase_risks(
    project: str,
    branch: str | None = None,
    severity: str | None = None,
    category: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> TPayload:
    _check_page(limit, offset)
    ov = await _overview(project)
    risks = ov.get("risks", {})
    items = risks.get("items", [])
    if severity:
        items = [r for r in items if r.get("severity") == severity]
    if category:
        items = [r for r in items if r.get("category") == category]
    return text({"state": risks.get("state"), **_page(items, limit, offset)})


@mcp.tool(
    description=(
        "Recent commits from the indexed repository (author, message, time). The "
        "commit the index was built from is flagged `is_indexed_head`; the rest are "
        "history and are NOT part of the current analysis. `since` filters by ISO "
        "timestamp. Paginated: check `truncated`."
    )
)
async def list_repository_changes(
    project: str,
    branch: str | None = None,
    since: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> TPayload:
    _check_page(limit, offset)
    ov = await _overview(project)
    changes = ov.get("changes", {})
    items = changes.get("items", [])
    if since:
        # ISO-8601 timestamps sort lexicographically, so a string compare is a
        # correct chronological filter without parsing.
        items = [c for c in items if (c.get("committed_at") or "") >= since]
    return text({"state": changes.get("state"), **_page(items, limit, offset)})


@mcp.tool(
    description=(
        "Trace where a feature/capability lives: search the indexed symbol graph for "
        "a text query and return matching symbols with their file locations as "
        "evidence. Requires a READY index (errors otherwise). Bounded by max_results."
    )
)
async def trace_codebase_feature(
    project: str, query: str, branch: str | None = None, max_results: int | None = None
) -> TPayload:
    q = (query or "").strip().lower()
    if not q:
        raise ApiError(400, "query must not be empty.")
    if max_results is not None and not 1 <= max_results <= MAX_PAGE:
        raise ApiError(400, f"max_results must be between 1 and {MAX_PAGE}.")
    cap = max_results or 20
    slug, pid = await resolve_ctx(project)
    graph = await api("GET", f"/workspaces/{slug}/projects/{pid}/code/graph/?view=full")
    matches = []
    for n in graph.get("nodes", []):
        hay = f"{n.get('id', '')} {n.get('label', '')} {n.get('source_file', '')}".lower()
        if q in hay:
            matches.append(
                {
                    "symbol": n.get("label") or n.get("id"),
                    "file": n.get("source_file"),
                    "kind": n.get("kind"),
                    "id": n.get("id"),
                }
            )
    return text(
        {
            "query": query,
            "returned": min(len(matches), cap),
            "truncated": len(matches) > cap,
            "matches": matches[:cap],
        }
    )


@mcp.tool(
    description=(
        "Resolve evidence ids (from list_codebase_risks item `id`s, module `key`s, or "
        "commit shas) to their supporting detail — file:line, analyzer, message. "
        "Returns citations, never raw source files. Unknown ids come back in "
        "`not_found`."
    )
)
async def get_codebase_evidence(project: str, evidence_ids: list[str]) -> TPayload:
    if not evidence_ids:
        raise ApiError(400, "evidence_ids must be a non-empty list.")
    if len(evidence_ids) > MAX_EVIDENCE_IDS:
        raise ApiError(400, f"Pass at most {MAX_EVIDENCE_IDS} evidence ids per call.")
    ov = await _overview(project)
    by_id: dict[str, dict] = {}
    for r in ov.get("risks", {}).get("items", []):
        by_id[r["id"]] = {"kind": "risk", **r}
    for m in ov.get("modules", {}).get("items", []):
        by_id[m["key"]] = {"kind": "module", **m}
    for c in ov.get("changes", {}).get("items", []):
        by_id[c["sha"]] = {"kind": "change", **c}
        by_id[c["short_sha"]] = {"kind": "change", **c}
    found = [by_id[i] for i in evidence_ids if i in by_id]
    not_found = [i for i in evidence_ids if i not in by_id]
    return text({"found": found, "not_found": not_found})


