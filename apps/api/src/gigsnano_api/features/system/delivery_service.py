"""Delivery Bundle service (GIN-414): coordinate branches/PRs/checks/merge across
repos for one work item. Overall state is computed from the per-repo rows.
"""

from __future__ import annotations

import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.system import code_scope_service, delivery_state
from gigsnano_api.features.system.schemas import (
    DeliveryOut,
    DeliveryRepoOut,
    UpdateDeliveryRepoPayload,
)
from gigsnano_api.features.system.service import _active_repos
from gigsnano_api.models.system import DeliveryBundle, DeliveryRepository


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:40] or "work"


def _branch_name(pattern: str, code: str, title: str) -> str:
    return (
        (pattern or "feature/{code}-{slug}")
        .replace("{code}", code)
        .replace("{slug}", _slugify(title))
    )


def _repo_dict(r: DeliveryRepository) -> dict:
    return {
        "project_repository_id": r.project_repository_id,
        "required": r.required,
        "no_change": r.no_change,
        "ci_state": r.ci_state.value,
        "review_state": r.review_state.value,
        "merge_state": r.merge_state.value,
        "pr_url": r.pr_url,
        "head_branch": r.head_branch,
        "commit_count": r.commit_count,
    }


async def _bundle(db: AsyncSession, story_id: str) -> DeliveryBundle | None:
    row = await db.execute(select(DeliveryBundle).where(DeliveryBundle.work_item_id == story_id))
    return row.scalar_one_or_none()


async def _rows(db: AsyncSession, bundle_id: str) -> list[DeliveryRepository]:
    res = await db.execute(
        select(DeliveryRepository)
        .where(DeliveryRepository.delivery_bundle_id == bundle_id)
        .order_by(DeliveryRepository.merge_order, DeliveryRepository.created_at)
    )
    return list(res.scalars().all())


async def _serialize(db: AsyncSession, project_id: str, bundle: DeliveryBundle) -> DeliveryOut:
    rows = await _rows(db, bundle.id)
    names = {r.id: r.display_name for r in await _active_repos(db, project_id)}
    dicts = [_repo_dict(r) for r in rows]
    return DeliveryOut(
        id=bundle.id,
        work_item_id=bundle.work_item_id,
        branch_name=bundle.branch_name,
        overall_state=delivery_state.compute_overall_state(
            dicts, cancelled=bundle.cancelled, rollback_required=bundle.rollback_required
        ),
        cancelled=bundle.cancelled,
        rollback_required=bundle.rollback_required,
        repositories=[
            DeliveryRepoOut(
                project_repository_id=r.project_repository_id,
                display_name=names.get(r.project_repository_id, ""),
                base_branch=r.base_branch,
                head_branch=r.head_branch,
                commit_count=r.commit_count,
                pr_url=r.pr_url,
                pr_id=r.pr_id,
                required=r.required,
                ci_state=r.ci_state,
                review_state=r.review_state,
                merge_order=r.merge_order,
                merge_state=r.merge_state,
                no_change=r.no_change,
                change_summary=r.change_summary,
                deployment_impact=r.deployment_impact,
            )
            for r in rows
        ],
        blocking_repo_ids=[] if bundle.cancelled else delivery_state.blocking_repos(dicts),
        created_at=bundle.created_at,
        updated_at=bundle.updated_at,
    )


async def create_delivery(
    db: AsyncSession, project_id: str, story_id: str, user_id: str
) -> DeliveryOut:
    """Create the Delivery Bundle from the confirmed Code scope (idempotent).
    Only Write repos get a delivery row; a coordinated branch name is generated."""
    existing = await _bundle(db, story_id)
    if existing is not None:
        return await _serialize(db, project_id, existing)

    # Requires a confirmed scope (409 otherwise) — that is the exec gate.
    effective = await code_scope_service.effective_scope(db, project_id, story_id)
    scope = await code_scope_service._existing(db, story_id)
    assert scope is not None
    scope_rows = {
        r.project_repository_id: r for r in await code_scope_service._repo_scope_rows(db, scope.id)
    }

    story = await code_scope_service._load_story(db, project_id, story_id)
    from gigsnano_api.models import Project

    project = await db.get(Project, project_id)
    number = getattr(story, "story_number", None)
    code = f"{project.identifier}-{number}" if project and number else story_id[:8]
    branch = _branch_name(scope.branch_pattern, code, story.title)

    bundle = DeliveryBundle(
        work_item_id=story_id,
        code_scope_id=scope.id,
        bundle_version_id=scope.bundle_version_id,
        branch_name=branch,
        created_by=user_id,
    )
    db.add(bundle)
    await db.flush()
    for order, repo_id in enumerate(effective.write):
        rs = scope_rows.get(repo_id)
        db.add(
            DeliveryRepository(
                delivery_bundle_id=bundle.id,
                project_repository_id=repo_id,
                base_branch=rs.base_branch if rs else "main",
                head_branch=branch,
                required=rs.required_delivery if rs else True,
                merge_order=order,
            )
        )
    await db.commit()
    await db.refresh(bundle)
    return await _serialize(db, project_id, bundle)


async def get_delivery(db: AsyncSession, project_id: str, story_id: str) -> DeliveryOut:
    bundle = await _bundle(db, story_id)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No delivery bundle for this work item")
    return await _serialize(db, project_id, bundle)


async def update_repo(
    db: AsyncSession,
    project_id: str,
    story_id: str,
    repo_id: str,
    payload: UpdateDeliveryRepoPayload,
) -> DeliveryOut:
    bundle = await _bundle(db, story_id)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No delivery bundle for this work item")
    row = next((r for r in await _rows(db, bundle.id) if r.project_repository_id == repo_id), None)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not in this delivery bundle")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(bundle)
    return await _serialize(db, project_id, bundle)


async def set_cancelled(
    db: AsyncSession, project_id: str, story_id: str, cancelled: bool
) -> DeliveryOut:
    bundle = await _bundle(db, story_id)
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No delivery bundle for this work item")
    bundle.cancelled = cancelled
    await db.commit()
    await db.refresh(bundle)
    return await _serialize(db, project_id, bundle)


async def blocks_done(db: AsyncSession, story_id: str) -> list[str]:
    """Required repos not merged (and not no-change) — these block work-item Done.
    Empty (does not block) when there is no delivery bundle, or it is cancelled."""
    bundle = await _bundle(db, story_id)
    if bundle is None or bundle.cancelled:
        return []
    return delivery_state.blocking_repos([_repo_dict(r) for r in await _rows(db, bundle.id)])
