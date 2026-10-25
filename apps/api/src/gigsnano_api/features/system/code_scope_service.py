"""Work-item Code scope (GIN-413): choose a bundle + classify each repo
Write/Reference/Excluded, draft -> confirm, pinned to a bundle version.

Kept separate from the bundle service so the safety rules (confirm gate, pinned
version, reference->write escalation audit) live in one testable place.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import utcnow
from gigsnano_api.features.system.schemas import (
    CodeScopeOut,
    EffectiveScopeOut,
    RepoScopeOut,
    SaveCodeScopePayload,
)
from gigsnano_api.features.system.service import _active_bundles, _active_repos, _current_version
from gigsnano_api.models import Story
from gigsnano_api.models.system import (
    ECodeScopeStatus,
    ERepoAccess,
    ERepoScopeMode,
    SystemBundle,
    SystemBundleVersion,
    WorkItemCodeScope,
    WorkItemRepositoryScope,
)

logger = logging.getLogger("gigsnano.multi_repo")

_DEFAULT_BRANCH_PATTERN = "feature/{code}-{slug}"


async def _load_story(db: AsyncSession, project_id: str, story_id: str) -> Story:
    story = await db.get(Story, story_id)
    if story is None or story.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work item not found")
    return story


async def _default_bundle(
    db: AsyncSession, project_id: str
) -> tuple[SystemBundle, SystemBundleVersion] | None:
    for bundle in await _active_bundles(db, project_id):
        if bundle.is_default:
            return bundle, await _current_version(db, bundle)
    return None


async def _repo_names(db: AsyncSession, project_id: str) -> dict[str, str]:
    return {r.id: r.display_name for r in await _active_repos(db, project_id)}


def _default_repo_scopes(version: SystemBundleVersion, names: dict[str, str]) -> list[dict]:
    """Bundle Write repos -> Write; Reference repos -> Reference (spec defaults)."""
    out: list[dict] = []
    for cfg in (version.configuration_json or {}).get("repositories", []):
        rid = cfg["project_repository_id"]
        is_write = cfg.get("access") == ERepoAccess.WRITE.value
        out.append(
            {
                "project_repository_id": rid,
                "mode": ERepoScopeMode.WRITE.value if is_write else ERepoScopeMode.REFERENCE.value,
                "required_delivery": bool(cfg.get("required")) and is_write,
                "base_branch": cfg.get("branch", "main"),
                "reason": "",
                "display_name": names.get(rid, ""),
            }
        )
    return out


async def _existing(db: AsyncSession, story_id: str) -> WorkItemCodeScope | None:
    row = await db.execute(
        select(WorkItemCodeScope).where(WorkItemCodeScope.work_item_id == story_id)
    )
    return row.scalar_one_or_none()


async def _repo_scope_rows(db: AsyncSession, scope_id: str) -> list[WorkItemRepositoryScope]:
    rows = await db.execute(
        select(WorkItemRepositoryScope).where(WorkItemRepositoryScope.code_scope_id == scope_id)
    )
    return list(rows.scalars().all())


def _serialize(
    story_id: str,
    scope: WorkItemCodeScope | None,
    repos: list[dict],
    bundle_id: str | None,
    version: SystemBundleVersion | None,
    has_default_bundle: bool,
) -> CodeScopeOut:
    return CodeScopeOut(
        id=scope.id if scope else None,
        work_item_id=story_id,
        bundle_id=bundle_id,
        bundle_version_id=(scope.bundle_version_id if scope else (version.id if version else None)),
        bundle_version=version.version if version else None,
        status=scope.status if scope else ECodeScopeStatus.DRAFT,
        branch_pattern=scope.branch_pattern if scope else _DEFAULT_BRANCH_PATTERN,
        reason=scope.reason if scope else "",
        confirmed_by=scope.confirmed_by if scope else None,
        confirmed_at=scope.confirmed_at if scope else None,
        repositories=[RepoScopeOut(**r) for r in repos],
        has_default_bundle=has_default_bundle,
        created_at=scope.created_at if scope else None,
        updated_at=scope.updated_at if scope else None,
    )


async def get_code_scope(db: AsyncSession, project_id: str, story_id: str) -> CodeScopeOut:
    await _load_story(db, project_id, story_id)
    names = await _repo_names(db, project_id)
    default = await _default_bundle(db, project_id)
    bundle_id = default[0].id if default else None
    version = default[1] if default else None

    scope = await _existing(db, story_id)
    if scope is not None:
        rows = await _repo_scope_rows(db, scope.id)
        repos = [
            {
                "project_repository_id": r.project_repository_id,
                "mode": r.mode.value,
                "required_delivery": r.required_delivery,
                "base_branch": r.base_branch,
                "reason": r.reason,
                "display_name": names.get(r.project_repository_id, ""),
            }
            for r in rows
        ]
        # A saved scope may pin an older version; surface that version's number.
        pinned = (
            await db.get(SystemBundleVersion, scope.bundle_version_id)
            if scope.bundle_version_id
            else None
        )
        return _serialize(story_id, scope, repos, bundle_id, pinned or version, default is not None)

    # No saved scope → derive a (Draft, unpersisted) default from the default bundle.
    repos = _default_repo_scopes(version, names) if version else []
    return _serialize(story_id, None, repos, bundle_id, version, default is not None)


async def _upsert(
    db: AsyncSession, project_id: str, story_id: str, payload: SaveCodeScopePayload
) -> WorkItemCodeScope:
    default = await _default_bundle(db, project_id)
    version = default[1] if default else None
    scope = await _existing(db, story_id)
    if scope is None:
        scope = WorkItemCodeScope(
            work_item_id=story_id,
            bundle_version_id=payload.bundle_version_id or (version.id if version else None),
        )
        db.add(scope)
        await db.flush()
    # Editing un-confirms: it must be re-confirmed before it can gate execution.
    scope.status = ECodeScopeStatus.DRAFT
    scope.confirmed_by = None
    scope.confirmed_at = None
    if payload.bundle_version_id is not None:
        scope.bundle_version_id = payload.bundle_version_id
    if payload.branch_pattern is not None:
        scope.branch_pattern = payload.branch_pattern.strip() or _DEFAULT_BRANCH_PATTERN
    if payload.reason is not None:
        scope.reason = payload.reason.strip()

    for row in await _repo_scope_rows(db, scope.id):
        await db.delete(row)
    await db.flush()
    for item in payload.repositories:
        db.add(
            WorkItemRepositoryScope(
                code_scope_id=scope.id,
                project_repository_id=item.project_repository_id,
                mode=item.mode,
                required_delivery=item.required_delivery,
                base_branch=item.base_branch,
                reason=item.reason,
            )
        )
    await db.commit()
    return scope


async def save_code_scope(
    db: AsyncSession, project_id: str, story_id: str, payload: SaveCodeScopePayload
) -> CodeScopeOut:
    await _load_story(db, project_id, story_id)
    await _upsert(db, project_id, story_id, payload)
    return await get_code_scope(db, project_id, story_id)


async def reset_code_scope(db: AsyncSession, project_id: str, story_id: str) -> CodeScopeOut:
    await _load_story(db, project_id, story_id)
    scope = await _existing(db, story_id)
    if scope is not None:
        await db.delete(scope)  # cascade drops repo scopes; get() re-derives defaults
        await db.commit()
    return await get_code_scope(db, project_id, story_id)


async def _persist_defaults(
    db: AsyncSession,
    project_id: str,
    story_id: str,
    version: SystemBundleVersion | None,
    names: dict[str, str],
) -> WorkItemCodeScope:
    """Frictionless single-repo path: save the derived defaults so confirm has a row."""
    derived = _default_repo_scopes(version, names) if version else []
    await _upsert(
        db,
        project_id,
        story_id,
        SaveCodeScopePayload(
            bundle_version_id=version.id if version else None,
            repositories=[
                {  # type: ignore[list-item]  (pydantic coerces the dict)
                    "project_repository_id": r["project_repository_id"],
                    "mode": r["mode"],
                    "required_delivery": r["required_delivery"],
                    "base_branch": r["base_branch"],
                }
                for r in derived
            ],
        ),
    )
    scope = await _existing(db, story_id)
    assert scope is not None
    return scope


def _validate_scope_repos(rows: list[WorkItemRepositoryScope], active_ids: set[str]) -> None:
    for row in rows:
        if row.mode != ERepoScopeMode.EXCLUDED and row.project_repository_id not in active_ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Repository {row.project_repository_id} is not an active repository in this project",
            )


def _audit_escalations(
    rows: list[WorkItemRepositoryScope],
    version: SystemBundleVersion | None,
    names: dict[str, str],
    story_id: str,
    user_id: str,
) -> None:
    """Record any Reference->Write promotion vs the bundle default (safety AC)."""
    defaults = {
        r["project_repository_id"]: r["mode"]
        for r in (_default_repo_scopes(version, names) if version else [])
    }
    for row in rows:
        escalated = (
            row.mode == ERepoScopeMode.WRITE
            and defaults.get(row.project_repository_id) == ERepoScopeMode.REFERENCE.value
        )
        if escalated:
            logger.info(
                "code_scope_write_escalation",
                extra={
                    "work_item_id": story_id,
                    "project_repository_id": row.project_repository_id,
                    "confirmed_by": user_id,
                },
            )


async def confirm_code_scope(
    db: AsyncSession, project_id: str, story_id: str, user_id: str
) -> CodeScopeOut:
    await _load_story(db, project_id, story_id)
    names = await _repo_names(db, project_id)
    default = await _default_bundle(db, project_id)
    version = default[1] if default else None

    scope = await _existing(db, story_id)
    if scope is None:
        scope = await _persist_defaults(db, project_id, story_id, version, names)

    rows = await _repo_scope_rows(db, scope.id)
    _validate_scope_repos(rows, set(names))
    _audit_escalations(rows, version, names, story_id, user_id)

    scope.status = ECodeScopeStatus.CONFIRMED
    scope.confirmed_by = user_id
    scope.confirmed_at = utcnow()
    if scope.bundle_version_id is None and version is not None:
        scope.bundle_version_id = version.id
    await db.commit()
    return await get_code_scope(db, project_id, story_id)


async def effective_scope(db: AsyncSession, project_id: str, story_id: str) -> EffectiveScopeOut:
    await _load_story(db, project_id, story_id)
    scope = await _existing(db, story_id)
    if scope is None or scope.status != ECodeScopeStatus.CONFIRMED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Code scope must be confirmed before execution"
        )
    rows = await _repo_scope_rows(db, scope.id)
    buckets: dict[ERepoScopeMode, list[str]] = {m: [] for m in ERepoScopeMode}
    for row in rows:
        buckets[row.mode].append(row.project_repository_id)
    return EffectiveScopeOut(
        work_item_id=story_id,
        bundle_version_id=scope.bundle_version_id,
        branch_pattern=scope.branch_pattern,
        write=buckets[ERepoScopeMode.WRITE],
        reference=buckets[ERepoScopeMode.REFERENCE],
        excluded=buckets[ERepoScopeMode.EXCLUDED],
        confirmed_at=scope.confirmed_at,
    )
