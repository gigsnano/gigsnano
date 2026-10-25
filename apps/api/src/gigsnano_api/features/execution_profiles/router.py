from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.execution_profiles import service as S
from gigsnano_api.features.execution_profiles.schemas import OverridePayload, PersistProfilePayload
from gigsnano_api.marketplace.deps import StoryRouteAccess, require_story_route_access
from gigsnano_api.shared.context import ADMINS

router = APIRouter(tags=["execution-profiles"])
_B = "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/execution-profile"


def _text(route: StoryRouteAccess) -> str:
    return f"{route.story.title}\n{route.story.description or ''}"


@router.post(_B + "/")
async def persist_profile(
    payload: PersistProfilePayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    # Gate ANY explicit policy change behind admins — not just setting "locked".
    # Otherwise a non-admin could POST policy="suggest" to unlock a frozen profile.
    if payload.policy is not None and (route.member_ctx is None or route.member_ctx.role not in ADMINS):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can change a profile's policy")
    row = await S.resolve_and_persist(
        db, route.story, route.project.workspace_id, _text(route), payload.agent, payload.policy
    )
    await db.commit()
    return S.to_dict(row, stale=False)


@router.get(_B + "/stored/")
async def get_stored_profile(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    row = await S.get_stored(db, route.story.id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No stored profile")
    stale = await S.is_stale(db, row, route.project.workspace_id, _text(route))
    return S.to_dict(row, stale)


@router.post(_B + "/override/")
async def override_profile(
    payload: OverridePayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    row = await S.get_stored(db, route.story.id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No stored profile; persist first")
    try:
        row = await S.apply_override(db, row, [c.model_dump() for c in payload.changes], payload.reason)
    except S.ProfileLocked as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    await db.commit()
    return S.to_dict(row, stale=False)
