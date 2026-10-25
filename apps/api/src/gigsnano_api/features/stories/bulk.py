"""Bulk work-item mutation (GIN-382).

One request, many work items, only the named fields written. Same contract as the
module bulk-assign endpoint (GIN-380): `dry_run`, per-item updated/unchanged/failed,
each item's previous values (that IS the rollback payload), and a correlation id
tying the change to the project feed and to every item's history.

Deliberately not a loop over the PATCH route: that route carries per-item
notification, webhook and readiness side effects which do not make sense fanned out
100×. The governance the PATCH route enforces is kept — BMAD locks and workflow
gates are evaluated per item, and a blocked item is reported, never silently
applied.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.db import get_db
from gigsnano_api.features.cycles.router import _get_cycle_or_404
from gigsnano_api.features.modules.router import _get_module_or_404
from gigsnano_api.features.mutations import structured_http
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.features.stories.codes import resolve_codes
from gigsnano_api.features.stories.schemas import LegacyLabelMixin
from gigsnano_api.features.stories.service import (
    _apply_story_update,
    _validate_settings_refs,
)
from gigsnano_api.models import (
    EProjectActivityType,
    EStoryPriority,
    EStoryStatus,
    EStoryType,
    Project,
    Story,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["stories"])

MAX_BULK_ITEMS = 500


class BulkStoryChanges(LegacyLabelMixin):
    """The fields a bulk operation may write. Anything absent is left untouched;
    an explicit null clears the field."""

    status: EStoryStatus | None = None
    priority: EStoryPriority | None = None
    type: EStoryType | None = None
    assignee_id: str | None = None
    cycle_id: str | None = None
    module_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None


class BulkUpdateStoriesPayload(BaseModel):
    codes: list[str] = Field(min_length=1, max_length=MAX_BULK_ITEMS)
    changes: BulkStoryChanges
    dry_run: bool = False


def _fmt(value: object) -> object:
    return getattr(value, "value", value)


async def _validate_changes(db: AsyncSession, project: Project, changes: dict) -> None:
    """Every referenced row must belong to this project — checked once for the whole
    batch, not per item, and before anything is written."""
    if not changes:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST,
            "no_changes",
            "Pass at least one field to change.",
            retryable=False,
        )
    if changes.get("cycle_id") is not None:
        await _get_cycle_or_404(db, project, changes["cycle_id"])
    if changes.get("module_id") is not None:
        await _get_module_or_404(db, project, changes["module_id"])
    if changes.get("assignee_id") is not None:
        from gigsnano_api.features.notifications.router import is_active_project_member

        if not await is_active_project_member(db, project.id, changes["assignee_id"]):
            raise structured_http(
                status.HTTP_400_BAD_REQUEST,
                "invalid_assignee",
                "The assignee must be an active member of this project.",
                retryable=False,
            )
    await _validate_settings_refs(db, project, changes)


async def _refuse_status_move(
    db: AsyncSession,
    llm: LLMProvider,
    project: Project,
    story: Story,
    diff: dict,
    ctx: WorkspaceContext,
) -> dict | None:
    """The governance the PATCH route applies to a status change, applied here too:
    a locked Sprint-0 card and a workflow gate that says no both refuse. Returns the
    failure entry, or None when the move is allowed."""
    if "status" not in diff:
        return None
    if story.bmad_workflow is not None and story.bmad_is_locked:
        return {"error": "bmad_locked"}
    from gigsnano_api.features.workflows.gate import evaluate_gate

    decision, allowed = await evaluate_gate(
        db, llm, project, story, diff["status"], actor=ctx.user, actor_role=ctx.role
    )
    if decision is not None and not allowed:
        return {"error": "gate_blocked", "detail": decision.rationale}
    return None


@router.post("/workspaces/{workspace_slug}/projects/{project_id}/stories/bulk-update/")
async def bulk_update_stories(
    payload: BulkUpdateStoriesPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict:
    changes = payload.changes.model_dump(exclude_unset=True)
    await _validate_changes(db, project, changes)

    correlation_id = str(uuid.uuid4())
    found, codes, failed = await resolve_codes(db, project, payload.codes)

    updated: list[dict] = []
    unchanged: list[dict] = []
    for num, story in sorted(found.items()):
        code = codes[num]
        diff = {f: v for f, v in changes.items() if getattr(story, f, None) != v}
        if not diff:
            unchanged.append({"code": code, "id": story.id})
            continue
        if blocked := await _refuse_status_move(db, llm, project, story, diff, ctx):
            failed.append({"code": code, **blocked})
            continue
        updated.append({
            "code": code,
            "id": story.id,
            "previous": {f: _fmt(getattr(story, f, None)) for f in diff},
            "proposed": {f: _fmt(v) for f, v in diff.items()},
        })
        if not payload.dry_run:
            await _apply_story_update(db, story, ctx.user, dict(diff))

    if payload.dry_run:
        await db.rollback()
    else:
        record_activity(
            db,
            project.id,
            EProjectActivityType.STORY,
            ctx.user,
            f"bulk updated {len(updated)} work items "
            f"({', '.join(sorted(changes))}) ({correlation_id})",
        )
        await db.commit()

    return {
        "correlation_id": correlation_id,
        "dry_run": payload.dry_run,
        "changes": {f: _fmt(v) for f, v in changes.items()},
        "updated": updated,
        "unchanged": unchanged,
        "failed": failed,
        "counts": {
            "updated": len(updated),
            "unchanged": len(unchanged),
            "failed": len(failed),
        },
    }
