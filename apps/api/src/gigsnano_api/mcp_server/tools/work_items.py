"""MCP tools for work items: fetch, search, context, lifecycle and comments/documents.

Split out of the single `tools.py` (GIN-382 follow-up) — the tools themselves and
their names are unchanged; `from gigsnano_api.mcp_server import tools` still sees
every one of them.
"""

import asyncio
import logging
from urllib.parse import urlencode

from gigsnano_api.mcp_server.api import (
    ApiError,
    TPayload,
    api,
    default_workspace,
    resolve_ctx,
    text,
)
from gigsnano_api.mcp_server.server import mcp
from gigsnano_api.mcp_server.tools._shared import (
    _FORMAT_NOTE,
    CONTEXT_ALL_INCLUDES,
    CONTEXT_DEFAULT_INCLUDES,
    DEFAULT_CONTENT_FORMAT,
    MAX_BULK_CODES,
    MAX_CONTEXT_COMMENTS,
    MAX_PAGE,
    _collection,
    _match_evidence,
    _resolve_parent_id,
    _resolve_story,
    _summarize,
    _with_query,
)


@mcp.tool(
    description=(
        "List the workspaces you belong to (slug, name, and whether each is the "
        "active MCP workspace). Use this to help the user pick one for "
        "set_active_workspace."
    )
)
async def list_workspaces() -> TPayload:
    rows = await api("GET", "/workspaces/")
    me = await api("GET", "/auth/me/")
    active = me.get("mcp_active_workspace_slug") if isinstance(me, dict) else None
    return text(
        [
            {"slug": w["slug"], "name": w.get("name"), "active": w["slug"] == active}
            for w in rows
        ]
    )


@mcp.tool(
    description=(
        "Who you are: your user id, display name and email. The id is the one "
        "work items carry as assignee_id and get_user takes. Needs no active workspace."
    )
)
async def whoami() -> TPayload:
    me = await api("GET", "/auth/me/")
    return text({"id": me["id"], "display_name": me["display_name"], "email": me["email"]})


@mcp.tool(
    description=(
        "Select which workspace the MCP acts on when you belong to more than one "
        "(like `az account set`). Persists per-user until changed. Ask the user which "
        "workspace before calling — do not guess. Optional: pass `workspace` to "
        "list_projects, or project='<workspace_slug>/<project_id>' to any "
        "project-scoped tool, to work in a workspace without selecting it."
    )
)
async def set_active_workspace(workspace: str) -> TPayload:
    rows = await api("GET", "/workspaces/")
    slugs = [w["slug"] for w in rows]
    if workspace not in slugs:
        raise ApiError(
            400,
            f"'{workspace}' is not one of your workspaces: {', '.join(slugs)}.",
        )
    await api("PATCH", "/auth/me/", {"mcp_active_workspace_slug": workspace})
    return text({"active_workspace": workspace})


@mcp.tool(description="List work items assigned to you.")
async def list_my_work_items() -> TPayload:
    slug = await default_workspace()
    page = await api("GET", f"/workspaces/{slug}/my-stories/")
    return text(
        [
            {
                "code": s["code"],
                "title": s["title"],
                "status": s["status"],
                "priority": s["priority"],
            }
            for s in page["items"]
        ]
    )


@mcp.tool(
    description=(
        "Fetch a work item's full context by code. The response's `content_format` "
        "field says what `description` holds: 'markdown' when a canonical copy "
        "exists, 'html' for content authored in the editor and not yet migrated."
    )
)
async def get_work_item(code: str, content_format: str = DEFAULT_CONTENT_FORMAT) -> TPayload:
    slug = await default_workspace()
    return text(await _resolve_story(slug, code, content_format))


@mcp.tool(
    description=(
        "Fetch several work items at once by code (max 50). Prefer this over "
        "repeated get_work_item calls. Unknown codes come back in `errors` rather "
        "than failing the whole batch."
    )
)
async def fetch_work_items(
    codes: list[str], content_format: str = DEFAULT_CONTENT_FORMAT
) -> TPayload:
    """Resolve many codes in one tool call (GIN-174).

    There is no bulk-resolve endpoint, so this fans out concurrently. The win is
    one agent round-trip instead of N -- the cost that actually dominates -- not
    fewer HTTP requests.
    """
    if not codes:
        raise ApiError(400, "codes must not be empty.")
    if len(codes) > MAX_BULK_CODES:
        raise ApiError(400, f"Too many codes ({len(codes)}); max {MAX_BULK_CODES}.")

    slug = await default_workspace()
    unique = list(dict.fromkeys(codes))  # collapse dupes, keep caller's order
    results = await asyncio.gather(
        *(_resolve_story(slug, c, content_format) for c in unique), return_exceptions=True
    )

    items: list[dict] = []
    errors: list[dict] = []
    for code, result in zip(unique, results):
        # One bad code must not discard the items that did resolve.
        if isinstance(result, BaseException):
            errors.append({"code": code, "error": str(result)})
        else:
            items.append(result)
    return text({"items": items, "errors": errors} if errors else {"items": items})


@mcp.tool(
    description=(
        "Search work items across the whole workspace by text — matches the exact "
        "work-item code (e.g. 'GIN-309'), title, and description, ranked by "
        "relevance (exact code/title first). Each hit carries `relevance_score`, "
        "`matched_fields` (code/title/description) and a sanitized `highlight`. Needs "
        "no project id, unlike list_work_items — use it before filing a new item to "
        "check one doesn't already exist. Only items you can access are searched."
    )
)
async def search_work_items(
    q: str,
    status: str | None = None,
    assignee_id: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> TPayload:
    """Workspace-wide relevance-ranked search (GIN-174, GIN-365).

    list_work_items is project-scoped and needs an id, which is useless for
    "does a ticket about X already exist anywhere?" -- the question that matters
    before creating a duplicate. The backend now matches the computed code and
    ranks exact code/title hits first; this tool adds the per-hit evidence.
    """
    if limit is not None and not 1 <= limit <= MAX_PAGE:
        raise ApiError(400, f"limit must be between 1 and {MAX_PAGE}.")
    if offset is not None and offset < 0:
        raise ApiError(400, "offset must not be negative.")

    slug = await default_workspace()
    query = urlencode(
        {
            k: v
            for k, v in {
                "q": q,
                "status": status,
                "assignee_id": assignee_id,
                "limit": limit,
                "offset": offset,
            }.items()
            if v is not None
        }
    )
    page = await api("GET", f"/workspaces/{slug}/stories/?{query}")
    items = page["items"]
    total = page.get("total", len(items))
    start = offset or 0
    return text(
        {
            "total": total,
            "returned": len(items),
            "offset": start,
            "truncated": start + len(items) < total,
            "items": [{**_summarize(s), **_match_evidence(q, s)} for s in items],
        }
    )


@mcp.tool(
    description=(
        "List an epic's or story's actual sub-items by parent code. Use this "
        "instead of assuming children are the next codes in sequence -- they "
        "often aren't."
    )
)
async def list_sub_work_items(code: str) -> TPayload:
    slug = await default_workspace()
    parent = await _resolve_story(slug, code)
    children = await api(
        "GET",
        f"/workspaces/{slug}/projects/{parent['project_id']}/stories/{parent['id']}/sub-stories/",
    )
    return text(
        {
            "parent": parent["code"],
            "count": len(children),
            "items": [_summarize(s) for s in children],
        }
    )


@mcp.tool(
    description=(
        "Fetch a work item plus its surrounding context in ONE bounded call — the "
        "item, its parent and children, typed relationships, links (incl. PR URLs), "
        "recent comments, and a project summary by default. Opt into more with "
        "`include`: 'documents', 'runs' (agent runs), 'options' (statuses/labels/"
        "cycles/modules/assignable members), 'routing' (persona recommendation). "
        "Every collection reports total/returned/truncated. Sections are read "
        "independently (snapshot_consistent=false); an unauthorized or failing "
        "section is omitted and noted under `errors`, never leaking its existence. "
        "Use the focused tools (get_work_item, list_comments, list_documents) for "
        "full bodies or pagination."
    )
)
async def get_work_item_context(
    code: str,
    include: list[str] | None = None,
    content_format: str = DEFAULT_CONTENT_FORMAT,
) -> TPayload:
    """Aggregate a work item's execution context (GIN-369).

    Composes existing authorized endpoints concurrently rather than adding a
    generic query tool: one agent round-trip instead of a chain of dependent
    calls, each section bounded, and a failing optional section degrades to an
    `errors` entry instead of failing the whole call.
    """
    sections = set(include) if include is not None else set(CONTEXT_DEFAULT_INCLUDES)
    unknown = sections - set(CONTEXT_ALL_INCLUDES)
    if unknown:
        raise ApiError(
            400,
            f"Unknown include(s): {', '.join(sorted(unknown))}. "
            f"Valid: {', '.join(CONTEXT_ALL_INCLUDES)}.",
        )

    slug = await default_workspace()
    story = await _resolve_story(slug, code, content_format)
    pid, sid = story["project_id"], story["id"]
    base = f"/workspaces/{slug}/projects/{pid}/stories/{sid}"
    proj_base = f"/workspaces/{slug}/projects/{pid}"

    plan: dict[str, object] = {}
    if "parent" in sections and story.get("parent_id"):
        plan["parent"] = api("GET", f"{proj_base}/stories/{story['parent_id']}/")
    if "children" in sections:
        plan["children"] = api("GET", f"{base}/sub-stories/")
    if "relations" in sections:
        plan["relations"] = api("GET", f"{base}/relations/")
    if "links" in sections:
        plan["links"] = api("GET", f"{base}/links/")
    if "comments" in sections:
        plan["comments"] = api("GET", f"{base}/comments/")
    if "documents" in sections:
        plan["documents"] = api("GET", f"{base}/documents/")
    if "runs" in sections:
        plan["runs"] = api("GET", f"{base}/runs/")
    if "project" in sections:
        plan["project"] = api("GET", f"{proj_base}/")
    if "routing" in sections:
        plan["routing"] = api("GET", f"{base}/route/")
    if "options" in sections:
        plan["states"] = api("GET", f"{proj_base}/states/")
        plan["labels"] = api("GET", f"{proj_base}/labels/")
        plan["cycles"] = api("GET", f"{proj_base}/cycles/")
        plan["modules"] = api("GET", f"{proj_base}/modules/")
        plan["members"] = api("GET", f"/workspaces/{slug}/members/")

    keys = list(plan)
    fetched = await asyncio.gather(*plan.values(), return_exceptions=True)
    raw: dict = {}
    errors: dict = {}
    for key, result in zip(keys, fetched):
        # A failed optional section must not sink the whole context call, and an
        # authorization 404 is surfaced as an error string — never as a leaked body.
        if isinstance(result, BaseException):
            errors[key] = str(result)
        else:
            raw[key] = result

    out: dict = {
        "work_item": story,
        "as_of": story.get("updated_at"),
        "version": story.get("updated_at"),
        "workspace": slug,
        "project_id": pid,
        # Each section is an independent authorized read, not one DB snapshot.
        "snapshot_consistent": False,
    }

    if "parent" in raw:
        out["parent"] = _summarize(raw["parent"])
    elif "parent" in sections and story.get("parent_id"):
        out["parent"] = None  # had a parent but it couldn't be loaded (see errors)

    if "children" in raw:
        out["children"] = _collection([_summarize(c) for c in raw["children"]])
    if "relations" in raw:
        out["relations"] = _collection(
            [
                {
                    "type": r["relation_type"],
                    "code": r.get("related_story_key"),
                    "title": r.get("related_story_title"),
                    "related_story_id": r.get("related_story_id"),
                }
                for r in raw["relations"]
            ]
        )
    if "links" in raw:
        out["links"] = _collection(
            [{"id": x["id"], "title": x.get("title"), "url": x.get("url")} for x in raw["links"]]
        )
    if "comments" in raw:
        allc = raw["comments"]
        recent = allc[-MAX_CONTEXT_COMMENTS:]
        out["comments"] = {
            "total": len(allc),
            "returned": len(recent),
            "truncated": len(allc) > len(recent),
            "content_format": "html",  # comment bodies are HTML (GIN-366 formalizes)
            "items": [
                {
                    "id": c["id"],
                    "author_id": c.get("author_id"),
                    "author_name": c.get("author_name"),
                    "body": c.get("body"),
                    "created_at": c.get("created_at"),
                }
                for c in recent
            ],
        }
    if "documents" in raw:
        out["documents"] = _collection(
            [
                {
                    "id": d["id"],
                    "title": d.get("title"),
                    "file_name": d.get("file_name"),
                    "mime_type": d.get("mime_type"),
                }
                for d in raw["documents"]
            ]
        )
    if "runs" in raw:
        out["runs"] = _collection(
            [
                {
                    "id": r["id"],
                    "state": r.get("state"),
                    "persona_id": r.get("persona_id"),
                    "autonomy": r.get("autonomy"),
                    "cost_tokens": r.get("cost_tokens"),
                    "created_at": r.get("created_at"),
                }
                for r in raw["runs"]
            ]
        )
    if "project" in raw:
        p = raw["project"]
        out["project"] = {
            "id": p["id"],
            "name": p.get("name"),
            "identifier": p.get("identifier"),
            "lead_id": p.get("lead_id"),
            "has_ui": p.get("has_ui"),
            "sprint_zero_status": p.get("sprint_zero_status"),
        }
    if "routing" in raw:
        out["routing"] = raw["routing"]
    if "options" in sections and any(k in raw for k in ("states", "labels", "cycles", "modules")):
        # Members are the deduplicated user directory; other sections reference
        # users by id only, so a user object is never repeated (GIN-369).
        out["options"] = {
            "statuses": [{"id": s["id"], "name": s.get("name")} for s in raw.get("states", [])],
            "labels": [
                {"id": x["id"], "name": x.get("name"), "color": x.get("color")}
                for x in raw.get("labels", [])
            ],
            "cycles": [{"id": c["id"], "name": c.get("name")} for c in raw.get("cycles", [])],
            "modules": [{"id": m["id"], "name": m.get("name")} for m in raw.get("modules", [])],
            "assignable_members": [
                {"id": m.get("user_id") or m.get("id"), "display_name": m.get("display_name")}
                for m in raw.get("members", [])
            ],
        }

    if errors:
        out["errors"] = errors
    return text(out)


@mcp.tool(description="Claim a work item: In Progress + comment.")
async def start_work_item(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    updated = await api(
        "PATCH",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/",
        {"status": "in_progress"},
    )
    await api(
        "POST",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/comments/",
        {"body": "Picked up via Claude Code.", "content_format": DEFAULT_CONTENT_FORMAT},
    )
    return text(updated)


@mcp.tool(
    description=(
        "Route a work item to the best-fit AI persona + skills. Classifies the "
        "task's domain + type and returns the recommended persona, skills, "
        "confidence, and a cited rationale — no side effects."
    )
)
async def route_work_item(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    routing = await api(
        "GET",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/route/",
    )
    return text(routing)


@mcp.tool(
    description=(
        "Hand a work item to the router: auto-select the best-fit persona and "
        "start a coordinated agent run for it. autonomy = suggest|draft|autopilot "
        "(default draft). Returns the run (id, persona, state, opening routing step)."
    )
)
async def coordinate_work_item(code: str, autonomy: str = "draft") -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    base = f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
    run = await api("POST", base + "/coordinate/", {"autonomy": autonomy})
    # Also surface the immutable Execution Profile — the resolved agent + pinned
    # skills (version+digest) — so the caller gets agent + profile + run id in one
    # call (GIN-342). Read-only; a resolver hiccup never fails the coordinate.
    try:
        profile = await api("GET", base + "/execution-profile/")
    except Exception:  # noqa: BLE001 — enrichment only; ANY failure (not just ApiError)
        profile = None  # must leave the coordinate result intact, never fail it
    return text({
        "run": run,
        "agent": (profile or {}).get("agent"),
        "execution_profile": profile,
    })


@mcp.tool(
    description=(
        "Resolve a work item's Execution Profile (read-only, no side effects): "
        "classifies the item and pins each routed skill to an immutable registry "
        "version + sha256 digest, with modes, gates, confidence and citations. "
        "Skills not yet published to the registry come back status='unavailable'."
    )
)
async def resolve_execution_profile(code: str, agent: str = "auto") -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    query = urlencode({"agent": agent})
    profile = await api(
        "GET",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
        f"/execution-profile/?{query}",
    )
    return text(profile)


@mcp.tool(
    description=(
        "Report ONE skill delivery/verification event to the run's telemetry log. "
        "Report only the state the agent actually reached — 'agent_reported_invoked' "
        "and 'gate_verified' are truthful only when the agent did the work; "
        "availability ('materialized') is never invocation. Idempotent per dedupe_key. "
        "state is one of: selected, resolved, downloaded, digest_verified, materialized, "
        "agent_acknowledged, agent_reported_invoked, gate_verified, failed, skipped, revoked."
    )
)
async def report_skill_event(
    code: str,
    run_id: str,
    skill_id: str,
    state: str,
    dedupe_key: str,
    version: str | None = None,
    digest: str | None = None,
    agent: str | None = None,
    gate: str | None = None,
    evidence: list[dict] | None = None,
    reason: str | None = None,
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    ev = await api(
        "POST",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
        f"/runs/{run_id}/skill-events/",
        {
            "skill_id": skill_id, "state": state, "dedupe_key": dedupe_key,
            "version": version, "digest": digest, "agent": agent, "gate": gate,
            "evidence": evidence or [], "reason": reason,
        },
    )
    return text(ev)


@mcp.tool(
    description=(
        "Get the work item's stored Execution Profile — creating one from the "
        "resolver if none exists yet. Returns the effective profile (with any "
        "overrides applied), a `stale` flag (true when the work item or registry "
        "changed since it was persisted), the policy, and the override history."
    )
)
async def get_execution_profile(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    base = (f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
            f"/execution-profile")
    try:
        prof = await api("GET", base + "/stored/")
    except ApiError as e:
        if e.status != 404:
            raise
        prof = await api("POST", base + "/", {"agent": "auto"})
    return text(prof)


@mcp.tool(
    description=(
        "Override a work item's Execution Profile: set a skill's mode to "
        "required|recommended|prohibited|removed, with a reason. `changes` is a "
        "list of {skillId, mode}. Rejected (403) if the profile policy is locked. "
        "Call get_execution_profile first to ensure a profile exists."
    )
)
async def override_execution_profile(code: str, changes: list[dict], reason: str = "") -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    prof = await api(
        "POST",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
        f"/execution-profile/override/",
        {"changes": changes, "reason": reason},
    )
    return text(prof)


@mcp.tool(
    description=(
        "Add a comment to a work item. Pass `idempotency_key` to make a retry safe — "
        "a repeat with the same key posts no duplicate comment." + _FORMAT_NOTE
    )
)
async def add_comment(
    code: str,
    body: str,
    content_format: str = DEFAULT_CONTENT_FORMAT,
    idempotency_key: str | None = None,
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    path = _with_query(
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/comments/",
        idempotency_key=idempotency_key,
    )
    await api("POST", path, {"body": body, "content_format": content_format})
    return text({"ok": True})


@mcp.tool(description="Hand a work item back for review (In Review) with a PR link + summary.")
async def complete_work_item(
    code: str, pr_url: str | None = None, summary: str | None = None
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    base = f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
    # Advisory skill gate (GIN-342): surface a run whose required skills aren't
    # verified — do NOT block (no agent emits gate_verified yet, so hard-blocking
    # would fail every completion). A gate read error never blocks the handoff.
    gate_note = ""
    try:
        gate = await api("GET", base + "/completion-gate/")
        if gate.get("run_id") and not gate.get("passed"):
            missing = ", ".join(gate.get("missing", [])) or "some required skills"
            gate_note = (
                f"⚠️ Skill gate (advisory): required skills not yet verified — {missing}. "
                "Report gate_verified events with evidence to clear this."
            )
    except Exception as err:  # noqa: BLE001 — advisory read: ANY failure (500/DB
        # hiccup, not just ApiError) degrades to "no note", never blocks the handoff
        logging.getLogger(__name__).debug("completion-gate read failed: %s", err)
    updated = await api("PATCH", base + "/", {"status": "in_review"})
    note = (
        "\n\n".join(x for x in [summary, gate_note, f"PR: {pr_url}" if pr_url else ""] if x)
        or "Completed via Claude Code."
    )
    await api("POST", base + "/comments/", {"body": note, "content_format": DEFAULT_CONTENT_FORMAT})
    return text(updated)


@mcp.tool(
    description=(
        "List work items in a project (status/assignee/q filters, limit/offset). "
        "Returns `total` and `truncated` -- the API pages at 50, so check them "
        "before concluding you've seen every item."
    )
)
async def list_work_items(
    project: str,
    status: str | None = None,
    assignee_id: str | None = None,
    q: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> TPayload:
    """List one page of a project's work items (GIN-174).

    `total`/`truncated` are the point. This used to return a bare array of the
    API's default 50 rows, which reads as "that is every item in the project" --
    a caller then can't tell a 50-item project from a 177-item one, and starts
    guessing at what it can't see.
    """
    if limit is not None and not 1 <= limit <= MAX_PAGE:
        raise ApiError(400, f"limit must be between 1 and {MAX_PAGE}.")
    if offset is not None and offset < 0:
        raise ApiError(400, "offset must not be negative.")

    slug, pid = await resolve_ctx(project)
    # urlencode, not an f-string join: a search term with spaces or & would
    # otherwise build a malformed URL.
    query = urlencode(
        {
            k: v
            for k, v in {
                "status": status,
                "assignee_id": assignee_id,
                "q": q,
                "limit": limit,
                "offset": offset,
            }.items()
            if v is not None
        }
    )
    path = f"/workspaces/{slug}/projects/{pid}/stories/"
    if query:
        path += f"?{query}"

    page = await api("GET", path)
    items = page["items"]
    total = page.get("total", len(items))
    start = offset or 0
    return text(
        {
            "total": total,
            "returned": len(items),
            "offset": start,
            "truncated": start + len(items) < total,
            "items": [_summarize(s) for s in items],
        }
    )


@mcp.tool(
    description=(
        "Create a work item in a project. Pass `parent` as a work-item code "
        "(e.g. 'GIN-313') to file it under an epic/story, or `parent_id` as a UUID. "
        "Pass `idempotency_key` to make a retry safe — a repeat with the same key "
        "returns the first item instead of filing a duplicate." + _FORMAT_NOTE
    )
)
async def create_work_item(
    project: str,
    title: str,
    description: str | None = None,
    content_format: str = DEFAULT_CONTENT_FORMAT,
    type: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    assignee_id: str | None = None,
    label_ids: list[str] | None = None,
    label_id: str | None = None,
    start_date: str | None = None,
    target_date: str | None = None,
    cycle_id: str | None = None,
    module_id: str | None = None,
    parent: str | None = None,
    parent_id: str | None = None,
    idempotency_key: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    payload = {
        k: v
        for k, v in {
            "title": title,
            "description": description,
            "content_format": content_format if description is not None else None,
            "type": type,
            "priority": priority,
            "status": status,
            "assignee_id": assignee_id,
            "label_ids": label_ids,
            "label_id": label_id,
            "start_date": start_date,
            "target_date": target_date,
            "cycle_id": cycle_id,
            "module_id": module_id,
            "parent_id": await _resolve_parent_id(slug, parent, parent_id),
        }.items()
        if v is not None
    }
    path = _with_query(
        f"/workspaces/{slug}/projects/{pid}/stories/", idempotency_key=idempotency_key
    )
    return text(await api("POST", path, payload))


@mcp.tool(
    description=(
        "Update a work item's fields by code. Pass `parent` as a work-item code "
        "(e.g. 'GIN-313') to re-parent under an epic/story, or `parent_id` as a UUID. "
        "Pass `expected_updated_at` (the `updated_at` you last read) for optimistic "
        "concurrency — a stale update returns a `stale_write` conflict with the "
        "current state instead of silently overwriting a newer change. Pass "
        "`dry_run=true` to preview the validated changes without committing. "
        "Pass `created_at` (ISO-8601, e.g. '2026-03-14' or "
        "'2026-03-14T09:30:00Z') to backdate imported work to when it really "
        "started — every date-windowed view reads created_at, so items left on "
        "the import date report a spike that never happened. It cannot be in "
        "the future, and the change is written to the item's history."
        + _FORMAT_NOTE
    )
)
async def update_work_item(
    code: str,
    title: str | None = None,
    description: str | None = None,
    content_format: str = DEFAULT_CONTENT_FORMAT,
    type: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    label_ids: list[str] | None = None,
    label_id: str | None = None,
    start_date: str | None = None,
    target_date: str | None = None,
    created_at: str | None = None,
    cycle_id: str | None = None,
    module_id: str | None = None,
    parent: str | None = None,
    parent_id: str | None = None,
    expected_updated_at: str | None = None,
    dry_run: bool = False,
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    patch = {
        k: v
        for k, v in {
            "title": title,
            "description": description,
            "content_format": content_format if description is not None else None,
            "type": type,
            "status": status,
            "priority": priority,
            "assignee_id": assignee_id,
            "label_ids": label_ids,
            "label_id": label_id,
            "start_date": start_date,
            "target_date": target_date,
            "created_at": created_at,
            "cycle_id": cycle_id,
            "module_id": module_id,
            "parent_id": await _resolve_parent_id(slug, parent, parent_id),
        }.items()
        if v is not None
    }
    base = f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}"
    if dry_run:
        # Validated preview, no commit (GIN-368) — reports which fields would change.
        return text(await api("POST", base + "/preview-update/", patch))
    path = _with_query(base + "/", expected_updated_at=expected_updated_at)
    return text(await api("PATCH", path, patch))


@mcp.tool(description="List a work item's comments.")
async def list_comments(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "GET",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/comments/",
        )
    )


@mcp.tool(description="Edit a comment." + _FORMAT_NOTE)
async def update_comment(
    code: str, comment_id: str, body: str, content_format: str = DEFAULT_CONTENT_FORMAT
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "PATCH",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/comments/{comment_id}/",
            {"body": body, "content_format": content_format},
        )
    )


@mcp.tool(description="Delete a comment.")
async def delete_comment(code: str, comment_id: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    await api(
        "DELETE",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/comments/{comment_id}/",
    )
    return text({"ok": True})


@mcp.tool(description="List a work item's documents.")
async def list_documents(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "GET",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/documents/",
        )
    )


@mcp.tool(description="Fetch one document by id.")
async def get_document(document_id: str) -> TPayload:
    slug = await default_workspace()
    return text(await api("GET", f"/workspaces/{slug}/documents/{document_id}/"))


@mcp.tool(
    description=(
        "Attach a file to a work item: PDF, DOCX, text, or a PNG/JPEG/WebP/GIF "
        "image. Pass `content` as base64 (or a data: URL). Images are signature-"
        "validated server-side and previewable in the web app."
    )
)
async def attach_file(
    code: str, title: str, file_name: str, mime_type: str, content: str
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "POST",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/documents/",
            {
                # project_id/story_id are required by UploadStoryDocumentPayload —
                # omitting them 422'd every upload (masked until an image now reaches
                # the endpoint instead of the old client-side image rejection).
                "project_id": story["project_id"],
                "story_id": story["id"],
                "title": title,
                "file_name": file_name,
                "mime_type": mime_type,
                "content": content,
            },
        )
    )


@mcp.tool(description="Delete a document by id.")
async def delete_document(document_id: str) -> TPayload:
    slug = await default_workspace()
    await api("DELETE", f"/workspaces/{slug}/documents/{document_id}/")
    return text({"ok": True})
