"""Advisory estimate suggestions for a work item (GIN-332).

Read-only and human-confirmed by contract — it returns a suggestion the UI turns
into Confirm/Modify/Dismiss; it never writes an estimate. Story-scoped via
require_story_route_access, so it can't read another workspace's history.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.lib.estimate_suggestion import HistoricalItem, suggest_estimate
from gigsnano_api.marketplace.deps import StoryRouteAccess, require_story_route_access
from gigsnano_api.models import EStoryStatus, Story

router = APIRouter(tags=["estimation"])


class EstimateSuggestionOut(BaseModel):
    applicable: bool
    planning_method: str
    suggested_value: float | None
    low: float | None
    high: float | None
    confidence: str
    reasons: list[str]
    similar_item_ids: list[str]
    model_version: str


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/estimate-suggestion/",
    response_model=EstimateSuggestionOut,
)
async def get_estimate_suggestion(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
) -> EstimateSuggestionOut:
    project, target = route.project, route.story
    rows = (
        await db.execute(
            select(Story.id, Story.type, Story.estimate_points).where(
                Story.project_id == project.id,
                Story.status == EStoryStatus.DONE,
                Story.estimate_points.is_not(None),
                Story.id != target.id,
            )
        )
    ).all()
    # Only work characteristics feed the suggestion — never assignee/identity.
    history = [
        HistoricalItem(id=r[0], story_type=r[1].value, points=float(r[2])) for r in rows
    ]
    s = suggest_estimate(project.planning_method.value, target.type.value, history)
    return EstimateSuggestionOut(
        applicable=s.applicable,
        planning_method=s.planning_method,
        suggested_value=s.suggested_value,
        low=s.low,
        high=s.high,
        confidence=s.confidence,
        reasons=list(s.reasons),
        similar_item_ids=list(s.similar_item_ids),
        model_version=s.model_version,
    )
