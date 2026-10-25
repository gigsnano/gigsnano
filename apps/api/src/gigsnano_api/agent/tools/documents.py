"""Read-only document tools over the project's Artifact store. Internal only."""

from __future__ import annotations

from sqlalchemy import or_, select

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.agent.tools.code import _load_project
from gigsnano_api.models import Artifact

_MAX_DOC_BYTES = 40_000
_SNIPPET = 160


async def _search_documents(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    raw = str(args.get("query", "")).strip()
    esc = raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    query = f"%{esc}%"
    stmt = select(Artifact).where(
        Artifact.project_id == proj.id,
        or_(
            Artifact.title.ilike(query, escape="\\"),
            Artifact.content_md.ilike(query, escape="\\"),
        ),
    )
    if args.get("doc_type"):
        stmt = stmt.where(Artifact.doc_type == args["doc_type"])
    rows = (await ctx.db.execute(stmt.order_by(Artifact.updated_at.desc()).limit(15))).scalars().all()
    if not rows:
        return ToolResult("No documents match.", summary="docs: 0")
    lines = [
        f"{a.title} [{a.doc_type}] — {(a.content_md or '')[:_SNIPPET].strip()} (id={a.id})"
        for a in rows
    ]
    return ToolResult("\n".join(lines), summary=f"docs: {len(rows)}")


async def _read_document(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    ref = str(args.get("ref", "")).strip()
    art = (
        await ctx.db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == proj.id,
                # The Situation block advertises the project's DOC TYPES ("Docs:
                # prd, story_file present"), so the model routinely passes one as
                # `ref`. Matching it is the obvious read of the intent — the old
                # id/title-only match dead-ended on a scary "No document matches
                # 'story_file'" and cost a wasted round (GIN-478).
                or_(Artifact.id == ref, Artifact.title == ref, Artifact.doc_type == ref),
            )
            .order_by(Artifact.version.desc())
            .limit(1)
        )
    ).scalars().first()
    if art is None:
        return ToolResult(
            f"No document matches {ref!r} — this project may not have one yet. "
            "Continue with what you already know; don't wait on a document.",
            summary=f"no doc: {ref}",
        )
    body = (art.content_md or "")[:_MAX_DOC_BYTES]
    return ToolResult(f"[doc:{art.title}]\n{body}", summary=f"read doc {art.title}")


SEARCH_DOCUMENTS = Tool(
    "search_documents",
    "Search the project's documents (brief, PRD, architecture, epics, stories, uploads) by "
    "keyword. Use for questions about requirements/design/specs. Returns titles + ids.",
    {
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "query": {"type": "string"},
            "doc_type": {"type": "string", "description": "Optional filter, e.g. prd, architecture."},
        },
        "required": ["project_id", "query"],
    },
    _search_documents,
    False,
)

READ_DOCUMENT = Tool(
    "read_document",
    "Read a project document by id or title. Cite it as [doc:Title].",
    {
        "type": "object",
        "properties": {"project_id": {"type": "string"}, "ref": {"type": "string"}},
        "required": ["project_id", "ref"],
    },
    _read_document,
    False,
)


def build_document_tools_registry() -> ToolRegistry:
    return ToolRegistry([SEARCH_DOCUMENTS, READ_DOCUMENT])
