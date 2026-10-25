"""MCP tools for external document-package import (GIN-399).

Exposes the GIN-394..398 pipeline so an agent can drive an import end to end:
upload, analyse, correct, propose, preview, apply, trace, roll back.

Two tools the ticket listed are deliberately absent rather than stubbed:

* `create_work_items_from_document_sections` — that is
  `propose_project_structure_from_documents` + `apply_project_import`. A third
  tool doing both would bypass the review step the whole epic exists to enforce.
* `create_dependencies_from_documents` — a dependency finding names a
  relationship in prose but not its two endpoints, so there is nothing to link
  yet (`apply_project_import` reports those changes as needing them chosen). A
  tool that pretended otherwise would guess at links between real work items.
"""

from gigsnano_api.mcp_server.api import TPayload, api, resolve_ctx, text
from gigsnano_api.mcp_server.server import mcp

_PKG = "/workspaces/{slug}/projects/{pid}/packages"

#: Finding states that mean "a human has to decide something" — what
#: list_project_intake_gaps reports.
_GAP_STATUSES = frozenset({"conflict", "missing", "assumption", "blocked"})


def _base(slug: str, pid: str) -> str:
    return _PKG.format(slug=slug, pid=pid)


@mcp.tool(
    description=(
        "Upload an external delivery package to a project: a list of files, each "
        "{file_name, mime_type, content}, where content is text or a base64 "
        "`data:` URL. A ZIP is expanded server-side. Returns the package with a "
        "per-document parse state — a file that cannot be read is reported as a "
        "row, not a failed upload."
    )
)
async def upload_project_package(
    project: str, files: list[dict], name: str = "Imported package"
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("POST", f"{_base(slug, pid)}/", {"name": name, "files": files}))


@mcp.tool(
    description=(
        "Fetch an uploaded package: its documents, their classifications and "
        "parse states, and how many are ready versus need attention."
    )
)
async def get_project_package(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"{_base(slug, pid)}/{package_id}/"))


@mcp.tool(
    description=(
        "Classify and analyse a package into typed, source-anchored findings — "
        "decisions, modules, phases, tasks, dependencies, risks, gaps. Read-only "
        "with respect to the project: it creates no work items. Re-running "
        "replaces this package's findings rather than adding to them."
    )
)
async def analyse_project_documents(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("POST", f"{_base(slug, pid)}/{package_id}/analyse/"))


@mcp.tool(
    description=(
        "List a package's findings with their kind, status, confidence and the "
        "document section each came from."
    )
)
async def list_project_findings(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"{_base(slug, pid)}/{package_id}/findings/"))


@mcp.tool(
    description=(
        "Correct a document's classification. doc_type is one of: "
        "product_requirements, architecture, ui_ux, design_system, "
        "implementation_plan, test_plan, security, deployment, api_spec, "
        "data_model, schedule, unknown. The AI's original verdict is kept, not "
        "overwritten."
    )
)
async def classify_project_documents(
    project: str, package_id: str, document_id: str, doc_type: str
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api(
            "PATCH",
            f"{_base(slug, pid)}/{package_id}/documents/{document_id}/",
            {"doc_type": doc_type},
        )
    )


@mcp.tool(
    description=(
        "Mark a document as canonical — a source of truth the implementation must "
        "follow — or clear that flag."
    )
)
async def set_canonical_project_document(
    project: str, package_id: str, document_id: str, canonical: bool = True
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api(
            "PATCH",
            f"{_base(slug, pid)}/{package_id}/documents/{document_id}/",
            {"canonical": canonical},
        )
    )


@mcp.tool(
    description=(
        "Propose project structure from a package's findings. strategy is "
        "'preserve' (mirror the supplied plan), 'convert' (GigsNano's canonical "
        "shape) or 'hybrid'. Creates nothing — it builds a reviewable change set. "
        "Refused (409) if a previous plan was already applied; roll that back first."
    )
)
async def propose_project_structure_from_documents(
    project: str, package_id: str, strategy: str = "convert"
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("POST", f"{_base(slug, pid)}/{package_id}/plan/", {"strategy": strategy})
    )


@mcp.tool(
    description=(
        "Preview the proposed import: counts by object type and status, every "
        "proposed change with the finding that justifies it, any blocking "
        "conflicts, and whether it can be applied yet."
    )
)
async def preview_project_import(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"{_base(slug, pid)}/{package_id}/plan/"))


@mcp.tool(
    description=(
        "Approve or exclude proposed changes. decision is 'approved', 'excluded' "
        "or 'proposed'. Omit change_ids to decide on every change at once. "
        "Deciding does not create anything — apply_project_import does."
    )
)
async def decide_project_import_changes(
    project: str, package_id: str, decision: str, change_ids: list[str] | None = None
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    body: dict = {"decision": decision}
    if change_ids is not None:
        body["change_ids"] = change_ids
    return text(await api("POST", f"{_base(slug, pid)}/{package_id}/plan/decide/", body))


@mcp.tool(
    description=(
        "Create the approved changes: modules, milestones, cycles, epics and "
        "stories, each linked back to the document section it came from. "
        "Idempotent — re-running creates nothing twice. Refused (409) while a "
        "conflicting finding is unresolved, naming the conflict."
    )
)
async def apply_project_import(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("POST", f"{_base(slug, pid)}/{package_id}/plan/apply/"))


@mcp.tool(
    description=(
        "Undo an applied import: deletes exactly what that run created and "
        "nothing else. Work that existed beforehand is untouched."
    )
)
async def rollback_project_import(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("POST", f"{_base(slug, pid)}/{package_id}/plan/rollback/"))


@mcp.tool(
    description=(
        "Trace provenance. Pass `code` for a work item's source documents and "
        "sections ('derived from'), or `document_id` (with package_id) for "
        "everything that document generated."
    )
)
async def get_document_traceability(
    project: str,
    code: str | None = None,
    package_id: str | None = None,
    document_id: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    if code:
        story = await api("GET", f"/workspaces/{slug}/stories/resolve/{code}")
        return text(
            await api("GET", f"/workspaces/{slug}/projects/{pid}/stories/{story['id']}/sources/")
        )
    if package_id and document_id:
        return text(
            await api(
                "GET", f"{_base(slug, pid)}/{package_id}/documents/{document_id}/work-items/"
            )
        )
    return text({"error": "Pass either code, or both package_id and document_id."})


@mcp.tool(
    description=(
        "List what still needs a human decision before this package can be "
        "imported: conflicts between documents, assumptions, gaps, and blocked "
        "items — each with the document section it came from."
    )
)
async def list_project_intake_gaps(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    analysis = await api("GET", f"{_base(slug, pid)}/{package_id}/findings/")
    gaps = [
        f for f in analysis.get("findings", [])
        if ((f.get("override") or {}).get("status") or f.get("status")) in _GAP_STATUSES
    ]
    return text({
        "package_id": package_id,
        "total": len(gaps),
        # Conflicts block the import; the rest only need a look.
        "blocking": sum(
            1 for f in gaps
            if ((f.get("override") or {}).get("status") or f.get("status")) == "conflict"
        ),
        "gaps": gaps,
    })


@mcp.tool(
    description=(
        "Resolve one intake gap by recording a decision on its finding. status is "
        "approved | proposed | assumption | blocked | missing | conflict. The "
        "AI's original finding is preserved; your decision is stored beside it."
    )
)
async def resolve_project_intake_gap(
    project: str,
    package_id: str,
    finding_id: str,
    status: str | None = None,
    title: str | None = None,
    detail: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    body = {k: v for k, v in (("status", status), ("title", title), ("detail", detail))
            if v is not None}
    return text(
        await api(
            "PATCH", f"{_base(slug, pid)}/{package_id}/findings/{finding_id}/", body
        )
    )


@mcp.tool(
    description=(
        "Where this package stands: document parse states, finding counts, "
        "outstanding gaps, and the import plan's status — one call to answer "
        "'what is left before I can import this?'."
    )
)
async def get_project_intake_status(project: str, package_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    package = await api("GET", f"{_base(slug, pid)}/{package_id}/")
    analysis = await api("GET", f"{_base(slug, pid)}/{package_id}/findings/")
    try:
        plan = await api("GET", f"{_base(slug, pid)}/{package_id}/plan/")
    except Exception:  # noqa: BLE001 — no plan yet is a state, not an error
        plan = None
    gaps = [
        f for f in analysis.get("findings", [])
        if ((f.get("override") or {}).get("status") or f.get("status")) in _GAP_STATUSES
    ]
    return text({
        "package": {
            "id": package["id"],
            "name": package["name"],
            "status": package["status"],
            "documents": package["counts"],
        },
        "findings": analysis.get("counts_by_status", {}),
        "gaps": len(gaps),
        "plan": None if plan is None else {
            "strategy": plan["strategy"],
            "status": plan["status"],
            "counts_by_target": plan["counts_by_target"],
            "counts_by_status": plan["counts_by_status"],
            "can_apply": plan["can_apply"],
            "blocking_conflicts": plan["blocking_conflicts"],
        },
    })
