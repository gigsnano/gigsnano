"""Propose project structure from a package's findings (GIN-396).

Deterministic on purpose. The findings are already typed and anchored by GIN-395,
so turning them into modules/cycles/epics/stories is a *mapping*, not a second
act of generation — and a mapping can be explained, diffed and tested, which is
what "explain every structural transformation" requires. Asking a model to
re-imagine the structure would also risk inventing scope the documents never
contained.

Nothing here writes a project object. It writes an ImportPlan of proposed
changes; GIN-397 applies an approved one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.packages import (
    DocumentPackage,
    ImportChange,
    ImportPlan,
    PackageFinding,
)


class AlreadyAppliedError(Exception):
    """Refuses to discard a plan that has already created work."""


#: Findings whose status means "a human must look at this before it becomes work".
_NEEDS_REVIEW_STATUSES = frozenset({"assumption", "missing"})
#: A conflict is never proposed as work — it blocks the plan until resolved.
_BLOCKING_STATUSES = frozenset({"conflict"})


def _slug(text: str, prefix: str) -> str:
    """A stable within-plan handle. Derived from the title so re-proposing the
    same package yields the same keys, which is what makes apply idempotent."""
    body = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80]
    return f"{prefix}:{body or 'untitled'}"


@dataclass
class _Proposed:
    op: str
    target: str
    temp_key: str
    title: str
    parent_temp_key: str | None = None
    payload: dict = field(default_factory=dict)
    status: str = "proposed"
    finding_id: str | None = None
    reason: str = ""
    confidence: float = 0.5


def _status_for(finding: PackageFinding) -> str:
    """An approved external decision is proposed as-is; an assumption or a gap
    needs a human before it becomes work."""
    effective = (finding.override or {}).get("status", finding.status)
    return "needs_review" if effective in _NEEDS_REVIEW_STATUSES else "proposed"


def _title_of(finding: PackageFinding) -> str:
    return ((finding.override or {}).get("title") or finding.title).strip()


def _base(finding: PackageFinding, target: str, prefix: str, parent: str | None = None):
    return _Proposed(
        op="create",
        target=target,
        temp_key=_slug(_title_of(finding), prefix),
        title=_title_of(finding)[:300],
        parent_temp_key=parent,
        payload={
            "description": (finding.override or {}).get("detail") or finding.detail,
            "source_anchor": finding.anchor,
        },
        status=_status_for(finding),
        finding_id=finding.id,
        reason=f"{finding.kind} from {finding.anchor}" if finding.anchor else finding.kind,
        confidence=finding.confidence,
    )


def _phase_epic_key(phase_title: str) -> str:
    return _slug(phase_title, "epic")


@dataclass
class _Context:
    """Carried across findings so a task can find the phase it belongs under."""

    strategy: str
    phase_titles: list[str] = field(default_factory=list)


def _map_module(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    return [_base(finding, "module", "module")]


def _map_phase(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    ctx.phase_titles.append(_title_of(finding))
    out = [_base(finding, "cycle", "cycle")]
    if ctx.strategy != "preserve":
        out.append(_base(finding, "milestone", "milestone"))
    # Tasks need somewhere to hang; one epic per phase is the smallest structure
    # that keeps an imported plan navigable.
    epic = _base(finding, "epic", "epic")
    epic.payload = {**epic.payload, "derived": "phase"}
    out.append(epic)
    return out


def _map_requirement(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    # preserve does not restructure requirements into epics — that would be
    # inventing a layer the supplied plan never had.
    target = "story" if ctx.strategy == "preserve" else "epic"
    return [_base(finding, target, target)]


def _map_task(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    """A task belongs to the phase whose section contains it.

    Prefer the anchor — "Spec > Phases > Phase 0" names its phase outright — and
    fall back to the most recent phase in document order. Relying on order alone
    is what put tasks under the wrong parent when two findings shared a position.
    """
    anchor = (finding.anchor or "").lower()
    by_anchor = next((t for t in reversed(ctx.phase_titles) if t.lower() in anchor), None)
    phase = by_anchor or (ctx.phase_titles[-1] if ctx.phase_titles else None)
    return [_base(finding, "story", "story", parent=_phase_epic_key(phase) if phase else None)]


def _map_dependency(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    return [_base(finding, "relation", "relation")]


def _map_prerequisite(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    return [_base(finding, "blocker", "blocker")]


def _map_risk(finding: PackageFinding, ctx: _Context) -> list[_Proposed]:
    # A risk becomes a blocker only once the documents say it is actually
    # blocking; otherwise it is information, not work.
    effective = (finding.override or {}).get("status", finding.status)
    return [_base(finding, "blocker", "blocker")] if effective == "blocked" else []


#: finding kind -> how it becomes proposed objects. Kinds absent here (decision,
#: constraint, open_question, testing, definition_of_done) are context a human
#: reads, not work to create.
_MAPPERS = {
    "module": _map_module,
    "phase": _map_phase,
    "requirement": _map_requirement,
    "task": _map_task,
    "dependency": _map_dependency,
    "prerequisite": _map_prerequisite,
    "risk": _map_risk,
}


def propose_changes(findings: list[PackageFinding], strategy: str) -> list[_Proposed]:
    """Map findings onto proposed objects. Pure: findings in, proposals out.

    - **preserve** mirrors the supplied plan: a phase becomes a cycle, its tasks
      become stories in it. Nothing is restructured and nothing is invented.
    - **convert** produces GigsNano's canonical shape: modules stay modules, a
      phase becomes a milestone *and* a cycle, a requirement becomes an epic, and
      tasks hang off the epic for their section.
    - **hybrid** is convert, but only decisions the documents marked approved are
      proposed outright — everything else is flagged for review first.
    """
    ctx = _Context(strategy=strategy)
    proposals: list[_Proposed] = []

    for finding in findings:
        effective_status = (finding.override or {}).get("status", finding.status)
        if effective_status in _BLOCKING_STATUSES:
            continue  # a conflict blocks the plan; it never becomes a proposal
        mapper = _MAPPERS.get(finding.kind)
        if mapper is not None:
            proposals.extend(mapper(finding, ctx))

    if strategy == "hybrid":
        for proposal in proposals:
            # Only what the documents actually settled comes through unflagged.
            if proposal.status == "proposed":
                proposal.status = "proposed" if proposal.confidence >= 0.8 else "needs_review"

    # A duplicate temp_key means two findings described the same object; keep the
    # first and let the second fall away rather than proposing it twice.
    seen: set[str] = set()
    deduped: list[_Proposed] = []
    for proposal in proposals:
        if proposal.temp_key in seen:
            continue
        seen.add(proposal.temp_key)
        deduped.append(proposal)
    return deduped


def blocking_conflicts(findings: list[PackageFinding]) -> list[PackageFinding]:
    """Findings that must be resolved before the plan can be applied."""
    return [
        f for f in findings
        if (f.override or {}).get("status", f.status) in _BLOCKING_STATUSES
    ]


async def build_import_plan(
    db: AsyncSession,
    *,
    package: DocumentPackage,
    project_id: str,
    strategy: str,
    user_id: str | None = None,
) -> ImportPlan:
    """Replace this package's plan with a fresh proposal under `strategy`.

    Re-proposing (including switching strategy) discards the previous *proposal*
    but never the findings or the user's corrections to them — those live on the
    findings, which this only reads.
    """
    # Only a draft is discarded. An applied plan is history — deleting it would
    # cascade its changes, and those are what say which work item came from where.
    for existing in (
        await db.execute(select(ImportPlan).where(ImportPlan.package_id == package.id))
    ).scalars():
        if existing.status in ("applied", "partially_applied"):
            raise AlreadyAppliedError(
                "This package's plan was already applied. Roll it back before proposing again."
            )
        await db.delete(existing)

    # Document order, not insertion order: findings written in one flush share a
    # created_at, so ordering by it is effectively random — and a task mapped
    # before its phase silently loses its parent. `anchor_start` is the real
    # position in the source document, which is what "order" means here.
    findings = list(
        (
            await db.execute(
                select(PackageFinding)
                .where(PackageFinding.package_id == package.id)
                .order_by(
                    PackageFinding.document_id,
                    PackageFinding.anchor_start,
                    PackageFinding.id,
                )
            )
        ).scalars()
    )

    plan = ImportPlan(
        package_id=package.id,
        project_id=project_id,
        strategy=strategy,
        created_by_id=user_id,
    )
    db.add(plan)
    await db.flush()

    for proposal in propose_changes(findings, strategy):
        db.add(
            ImportChange(
                plan_id=plan.id,
                op=proposal.op,
                target=proposal.target,
                status=proposal.status,
                temp_key=proposal.temp_key,
                parent_temp_key=proposal.parent_temp_key,
                title=proposal.title,
                payload=proposal.payload,
                finding_id=proposal.finding_id,
                reason=proposal.reason,
                confidence=proposal.confidence,
            )
        )
    await db.flush()
    return plan


async def plan_changes(db: AsyncSession, plan_id: str) -> list[ImportChange]:
    return list(
        (
            await db.execute(
                select(ImportChange)
                .where(ImportChange.plan_id == plan_id)
                .order_by(ImportChange.target, ImportChange.title)
            )
        ).scalars()
    )
