from datetime import date, datetime

from pydantic import BaseModel, Field

from gigsnano_api.models import ECycleStatus


class CreateCyclePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    start_date: date | None = None
    end_date: date | None = None


class UpdateCyclePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: ECycleStatus | None = None


class CycleOut(BaseModel):
    """Frontend ICycle."""

    id: str
    workspace_slug: str
    project_id: str
    name: str
    description: str
    status: ECycleStatus
    is_sprint_zero: bool
    start_date: date | None
    end_date: date | None
    story_count: int
    completed_story_count: int
    created_at: datetime
    updated_at: datetime
