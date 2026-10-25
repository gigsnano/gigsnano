"""GigsAI workspace-assistant prompt assembly. A static persona + a compact
workspace/project context block. Deliberately simpler than bmad/prompt.py — no
WorkflowSpec, no artifacts, no finalize."""

import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent.tools.instructions import REPO_CONTEXT_INSTRUCTION
from gigsnano_api.auth.models import User
from gigsnano_api.features.agents.router import BMAD_AGENTS
from gigsnano_api.models import Artifact, EStoryStatus, Project, Story, Workspace

_AGENTS_BY_ID = {agent["id"]: agent for agent in BMAD_AGENTS}

GIGS_SYSTEM_PROMPT = (
    "You are GigsAI, the product assistant embedded in this GigsNano workspace. "
    "You help with product management and the BMAD agile workflow: shaping ideas, "
    "PRDs, epics/stories, sprint planning, and answering questions about the "
    "workspace's projects. Be concise and practical. When you need a specific "
    "detail the user hasn't given, ask one focused question rather than guessing.\n\n"
    "When the user asks you to create a SINGLE work item (one story, task, bug, or "
    "feature), respond with one short sentence (\"Here's a draft — review and "
    'create it:") followed by a single fenced block in this exact form:\n'
    "```gigs:story\n"
    '{"title": "...", "type": "story", "description": "..."}\n'
    "```\n"
    "`type` must be one of story, task, bug, feature, epic. `description` is a "
    "short markdown summary. Emit at most one such block per reply. Keep the "
    "title concise.\n\n"
    "Turning a feature idea into an epic with stories:\n"
    "When the user describes a whole FEATURE or capability they want built (a "
    'requirement such as "we want customizable dashboards" or "add time '
    'tracking") — as opposed to one specific work item — do NOT draft yet and do '
    "NOT emit a gigs:story block. Instead:\n"
    "1. Offer first. Reply with a short line that ends in a question, then a "
    "numbered two-option list (so it renders as buttons), exactly like:\n"
    "This sounds like a feature to build. Want me to shape it into an epic and stories?\n"
    "1. Yes - break it into an epic + stories\n"
    "2. No - just answer my question\n"
    "If they choose 2 (or decline), answer their question normally.\n"
    "2. If they choose 1, ask 4-5 focused clarifying questions - scope, primary "
    "users, the MVP pieces/widgets, data sources, and constraints/scale. Phrase "
    "each as a numbered choice list or end the message with a single question so "
    "the answer is tappable; a few short turns is fine - don't ask all five at "
    "once.\n"
    "3. Then propose the epic and a short list of stories for review. Write each "
    "story as a bullet line starting with '- ' (NOT a numbered list) so the only "
    "numbered list in the message is the choice below and it renders as buttons. "
    "End with a question, then offer:\n"
    "1. Create these\n"
    "2. Let me adjust\n"
    "4. When they choose to create, use the create_work_item tool (NOT a "
    "gigs:story block): create the epic FIRST (type 'epic'), then create each "
    "story (type 'story') with parent set to the epic's code (e.g. 'GIN-45') so "
    "every story nests under the epic. If no project is in scope, ask which "
    "project to create in first.\n"
    "Documents are OPTIONAL context, never a precondition: if a document search "
    "or read comes back empty, say nothing about it and create the items from "
    "the conversation itself. Never stop, re-search, or ask the user to add a "
    "document before creating work items."
)

DIAGRAM_INSTRUCTION = (
    "When the user asks how something in their connected repository works, use the "
    "code tools (code_graph_query, then read_file / code_grep on the files it points to) "
    "to trace the real flow. After explaining it in prose, emit ONE fenced block:\n"
    "```gigs:diagram\n"
    '{"id":"<slug>","kind":"flow","title":"<short title>",'
    '"nodes":[{"id":"n1","label":"<name>","kind":"route|controller|service|model|external","summary":"<one line>","file":"<repo path>","expandable":true}],'
    '"edges":[{"source":"n1","target":"n2","label":"<call>"}]}\n'
    "```\n"
    "Use real file paths from the tools. Emit the block only when you have traced an actual flow; "
    "omit it for non-code questions."
)

ERD_INSTRUCTION = (
    "When the user asks about their connected repository's data model / database schema / "
    "tables, call the er_schema tool first. Then, after explaining it in prose, emit ONE "
    "fenced block:\n"
    "```gigs:erd\n"
    '{"dbml":"<DBML text>"}\n'
    "```\n"
    'You may include a pre-parsed "schema" alongside "dbml" if you already have it from '
    'er_schema, but "dbml" alone is enough — the frontend parses it. Emit the block only '
    "when er_schema returned a non-empty schema; otherwise tell the user no data model was "
    "detected in the repo."
)

METRICS_INSTRUCTION = (
    "When the user asks about code quality, complexity, duplication, or which files are "
    "risky/hard to maintain, call the code_metrics tool and cite specific files from its "
    'hotspots/complexity.worst lists (e.g. "this file is a hotspot") rather than guessing.'
)

GIGS_MODEL_MAP = {
    # GigsAI never runs on Opus: threads saved with the retired "opus-4-8" id run on Sonnet.
    "opus-4-8": "claude-sonnet-5",
    "sonnet-5": "claude-sonnet-5",
    "haiku-4-5": "claude-haiku-4-5-20251001",
}

CACHE = {"cache_control": {"type": "ephemeral"}}


def _strip_html(html: str, limit: int = 500) -> str:
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


# Cap the inline work-item list so a large backlog can't blow the token budget.
# The system block is prompt-cached, so this cost is paid once per thread, not
# per turn. Beyond the cap the assistant falls back to the work-item read tools.
_MAX_CONTEXT_STORIES = 40


async def _gather_work_items(db: AsyncSession, project: Project) -> str:
    """A compact, bounded list of the project's work items with the metadata
    GigsAI needs to answer contextually — code, title, type, status, priority,
    and assignee — newest-touched first. Full descriptions stay behind the
    work-item read tools so the list itself stays cheap (GIN-83)."""
    total = int(
        (await db.scalar(select(func.count(Story.id)).where(Story.project_id == project.id))) or 0
    )
    if total == 0:
        return ""
    rows = (
        await db.execute(
            select(Story, User.display_name)
            .outerjoin(User, User.id == Story.assignee_id)
            .where(Story.project_id == project.id)
            .order_by(Story.updated_at.desc())
            .limit(_MAX_CONTEXT_STORIES)
        )
    ).all()
    lines = ["Work items:"]
    for story, assignee_name in rows:
        code = (
            f"{project.identifier}-{story.story_number}"
            if story.story_number is not None
            else "(no code)"
        )
        assignee = assignee_name or "Unassigned"
        lines.append(
            f"- {code} {story.title} [{story.type.value}] — "
            f"{story.status.value}, {story.priority.value} priority, {assignee}"
        )
    if total > len(rows):
        lines.append(f"(showing {len(rows)} most recently updated of {total})")
    return "\n".join(lines)


async def gather_gigs_context(
    db: AsyncSession, workspace: Workspace, project_id: str | None
) -> str:
    """Compact context: workspace name + (if a project is in scope) its name,
    overview snippet, story counts by status, and a bounded list of the actual
    work items with their metadata so GigsAI can reference specific items."""
    parts = [f"Workspace: {workspace.name}"]
    if project_id:
        project = await db.get(Project, project_id)
        if project is not None and project.workspace_id == workspace.id:
            parts.append(f"Project: {project.name}")
            snippet = _strip_html(project.overview)
            if snippet:
                parts.append(f"Overview: {snippet}")
            rows = (
                await db.execute(
                    select(Story.status, func.count())
                    .where(Story.project_id == project.id)
                    .group_by(Story.status)
                )
            ).all()
            counts = {status.value: n for status, n in rows}
            if counts:
                summary = ", ".join(f"{s.value}: {counts.get(s.value, 0)}" for s in EStoryStatus)
                parts.append(f"Story counts — {summary}")
            work_items = await _gather_work_items(db, project)
            if work_items:
                parts.append(work_items)
    return "\n".join(parts)


def resolve_gigs_agent(agent_id: str | None) -> dict | None:
    if not agent_id:
        return None
    return _AGENTS_BY_ID.get(agent_id)


async def load_gigs_reference_documents(
    db: AsyncSession,
    workspace: Workspace,
    document_ids: list[str] | None,
) -> list[dict]:
    """Load workspace-scoped BMAD/user documents referenced via @-mention ids."""
    if not document_ids:
        return []
    rows = (
        (
            await db.execute(
                select(Artifact)
                .join(Project, Project.id == Artifact.project_id)
                .where(
                    Artifact.id.in_(document_ids),
                    Project.workspace_id == workspace.id,
                )
            )
        )
        .scalars()
        .all()
    )
    by_id = {artifact.id: artifact for artifact in rows}
    docs: list[dict] = []
    for doc_id in document_ids:
        artifact = by_id.get(doc_id)
        if artifact is None:
            continue
        docs.append(
            {
                "title": artifact.title,
                "file_name": artifact.file_name or f"{artifact.title}.md",
                "content": artifact.content_md,
            }
        )
    return docs


def build_gigs_system(
    context: str,
    *,
    agent: dict | None = None,
    context_docs: list[dict] | None = None,
) -> list[dict]:
    persona = GIGS_SYSTEM_PROMPT
    if agent:
        persona = (
            f"{GIGS_SYSTEM_PROMPT}\n\n"
            f"You are responding as {agent['name']} ({agent['persona']}), "
            f"a {agent['phase']} specialist — {agent['description']}"
        )
    persona = (
        f"{persona}\n\n{DIAGRAM_INSTRUCTION}\n\n{ERD_INSTRUCTION}\n\n{METRICS_INSTRUCTION}"
        f"\n\n{REPO_CONTEXT_INSTRUCTION}"
    )
    blocks = [{"type": "text", "text": persona, **CACHE}]
    if context:
        blocks.append({"type": "text", "text": context, **CACHE})
    if context_docs:
        parts = []
        for doc in context_docs:
            title = doc.get("title") or doc.get("file_name") or "Document"
            file_name = doc.get("file_name")
            header = f"### {title}" + (f" ({file_name})" if file_name else "")
            parts.append(f"{header}\n{doc.get('content', '')}")
        blocks.append({"type": "text", "text": "\n\n".join(parts), **CACHE})
    return blocks
