"""Wire shapes for PM-reported health updates (GIN-337)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from gigsnano_api.models.pm_health import EPmHealthStatus


class CreatePmHealthUpdatePayload(BaseModel):
    reported_status: EPmHealthStatus
    narrative: str = Field(min_length=1)
    key_risks: str | None = None
    next_milestone: str | None = Field(default=None, max_length=300)
    next_milestone_date: date | None = None
    decision_needed: str | None = None
    recovery_owner_id: str | None = None
    next_review_date: date | None = None
    work_item_refs: list[str] | None = None


class PmHealthUpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    reported_status: EPmHealthStatus
    narrative: str
    key_risks: str | None
    next_milestone: str | None
    next_milestone_date: date | None
    decision_needed: str | None
    recovery_owner_id: str | None
    next_review_date: date | None
    work_item_refs: list | None
    author_id: str | None
    author_name: str
    retracted_at: datetime | None
    created_at: datetime
