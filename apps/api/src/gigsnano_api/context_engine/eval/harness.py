"""Integration harness: index the pinned target, run each case through the real run_agent.

`run_case` and `preflight` are pure/stack-free (unit-tested). `ensure_target` and
`run_suite` execute only during the live acceptance run (plan Task 8) — they need a
running FalkorDB + SCIP stack and a checked-out target repo.
"""

from __future__ import annotations

from pathlib import Path

from gigsnano_api.agent.runner import AgentText, AgentToolCall, run_agent
from gigsnano_api.agent.tools.base import ToolContext
from gigsnano_api.agent.tools.instructions import REPO_CONTEXT_INSTRUCTION
from gigsnano_api.context_engine.eval.scoring import (
    CaseResult,
    CaseRun,
    load_cases,
    score_case,
)
from gigsnano_api.context_engine.graph import store
from gigsnano_api.core.config import settings

_DATASET = Path(__file__).with_name("dataset.yaml")
_EVAL_WS_SLUG = "eval-ws"


def _eval_project_id() -> str:
    """Project id = the target repo's folder name, so workspace_root(id) resolves to the
    real checkout under workspace_base_path (no junction → path-containment guard passes)."""
    return Path(settings.eval_target_repo_path).name or "eval-target"


def preflight() -> None:
    """Fail fast (clear message) when the target checkout or the live stack is missing."""
    from gigsnano_api.workspace.paths import workspace_root

    repo = Path(settings.eval_target_repo_path)
    if not settings.eval_target_repo_path or not repo.is_dir():
        raise RuntimeError(
            f"eval_target_repo_path not set or missing: {settings.eval_target_repo_path!r}. "
            "Point it at a local gigsnano-v2 checkout."
        )
    # The tools resolve files under workspace_root(project_id); it must BE the checkout.
    ws_root = workspace_root(_eval_project_id())
    if ws_root.resolve() != repo.resolve():
        raise RuntimeError(
            f"workspace_root({_eval_project_id()!r}) = {ws_root} does not equal the target "
            f"{repo.resolve()}. Set WORKSPACE_BASE_PATH to the checkout's PARENT dir "
            f"(e.g. {repo.resolve().parent})."
        )
    if not settings.eval_target_sha:
        raise RuntimeError(
            "eval_target_sha not set — pin the commit the goldens are authored against."
        )
    if not store.available():
        raise RuntimeError(
            "FalkorDB is unreachable. Start it (docker falkordb/falkordb on :6380) and set "
            "context_engine_enabled=true + falkordb_url."
        )


async def run_case(provider, registry, ctx, *, question: str, situation_text: str) -> CaseRun:
    """Drive the real run_agent for one question; capture the answer + tool names."""
    from gigsnano_api.features.gigs_ai.prompt import build_gigs_system

    system = build_gigs_system(situation_text)
    messages = [{"role": "user", "content": question}]
    parts: list[str] = []
    tool_calls: list[str] = []

    async def _on_usage(_i, _o):  # eval ignores usage accounting
        return None

    async for event in run_agent(
        provider, system=system, messages=messages,
        registry=registry, ctx=ctx, on_usage=_on_usage,
    ):
        if isinstance(event, AgentText):
            parts.append(event.text)
        elif isinstance(event, AgentToolCall):
            tool_calls.append(event.name)
    return CaseRun(answer="".join(parts), tool_calls=tool_calls)


# --- live-only (plan Task 8) ----------------------------------------------

async def _ensure_eval_project(session):
    """Get-or-create the eval workspace/user/project (idempotent by fixed slug).

    ponytail: finalized against real model fields during the Task 8 live run —
    membership/role details may need a tweak the first time the stack is up.
    """
    from sqlalchemy import select

    from gigsnano_api.models import ECloneStatus, Project, User, Workspace

    ws = (await session.execute(
        select(Workspace).where(Workspace.slug == _EVAL_WS_SLUG)
    )).scalar_one_or_none()
    if ws is None:
        ws = Workspace(slug=_EVAL_WS_SLUG, name="Eval Workspace")
        session.add(ws)
        await session.flush()

    user = (await session.execute(
        select(User).where(User.email == "eval@gigsnano.local")
    )).scalar_one_or_none()
    if user is None:
        user = User(email="eval@gigsnano.local", display_name="Eval Runner")
        session.add(user)
        await session.flush()

    pid = _eval_project_id()
    proj = await session.get(Project, pid)
    if proj is None:
        proj = Project(
            id=pid, workspace_id=ws.id,
            name="Eval Target (gigsnano-v2)", identifier="EVAL",
            cover_image_url="https://img.test/cover.jpg",
            repo_full_name="gigsnano/gigsnano-v2",
            clone_status=ECloneStatus.READY,
        )
        session.add(proj)
        await session.commit()
    return ws, user, proj


async def ensure_target(session):
    """Index the target checkout into FalkorDB (idempotent by sha). The checkout must live
    at workspace_root(project_id) — preflight enforces that — so the file-reading tools and
    the indexer agree on the same files (path-containment guard stays intact)."""
    from gigsnano_api.context_engine.index import build_context_index
    from gigsnano_api.models import EIndexStatus
    from gigsnano_api.workspace.paths import index_dir, workspace_root

    pid = _eval_project_id()
    ws, user, proj = await _ensure_eval_project(session)
    repo = workspace_root(pid)
    if proj.indexed_commit_sha != settings.eval_target_sha or store.count_nodes(pid) == 0:
        build_context_index(repo, index_dir(pid), pid)  # index_dir: where code_graph_query reads
        proj.indexed_commit_sha = settings.eval_target_sha
        proj.index_status = EIndexStatus.READY  # so build_situation reports "index ready"
        await session.commit()
    return ws, user, proj


async def run_suite(*, only: str | None = None) -> tuple[list[CaseResult], str, str]:
    """Index the target, run + score every case; return (results, instruction, situation)."""
    from gigsnano_api.agent.situation import build_situation
    from gigsnano_api.bmad.provider import build_default_provider
    from gigsnano_api.core.db import async_session
    from gigsnano_api.features.gigs_ai.router import build_gigs_ai_registry

    preflight()
    provider = build_default_provider()
    registry = build_gigs_ai_registry()
    cases = [c for c in load_cases(_DATASET) if only in (None, c.id)]
    results: list[CaseResult] = []
    first_situation = ""
    pid = _eval_project_id()
    async with async_session() as session:
        ws, user, _proj = await ensure_target(session)
        for case in cases:
            ctx = ToolContext(db=session, workspace=ws, user=user,
                              role="admin", project_id=pid)
            situation_text = await build_situation(session, ws, pid, case.surface)
            first_situation = first_situation or situation_text
            run = await run_case(provider, registry, ctx,
                                 question=case.question, situation_text=situation_text)
            results.append(await score_case(provider, case, run))
    return results, REPO_CONTEXT_INSTRUCTION, first_situation
