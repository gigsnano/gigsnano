from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from gigsnano_api.models.meetings import EMeetingPlatform, EMeetingStatus

ActionItemType = Literal["task", "feature", "bug", "story"]


class CreateMeetingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meeting_url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=200)
    consent_acknowledged: Literal[True]


class MeetingOut(BaseModel):
    id: str
    project_id: str
    title: str
    platform: EMeetingPlatform
    meeting_url: str
    status: EMeetingStatus
    failure_reason: str | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    created_by_id: str | None
    summary: str | None
    notes_status: str | None
    pending_action_items: int = 0


class TranscriptSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    seq: int
    speaker: str | None
    text: str
    start_ms: int
    end_ms: int


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    meeting_id: str
    status: str
    type: str
    title: str
    description: str
    quote: str
    speaker_name: str | None
    assignee_id: str | None
    target_date: date | None
    created_story_id: str | None
    position: int


class ActionItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    type: ActionItemType | None = None
    assignee_id: str | None = None
    target_date: date | None = None

    @model_validator(mode="after")
    def _no_explicit_nulls_on_required_fields(self) -> "ActionItemPatch":
        # title/description/type are non-nullable columns — omitting them from the
        # payload is fine (nothing changes), but sending an explicit `null` would
        # otherwise reach the DB as a NOT NULL violation (a 500). assignee_id and
        # target_date are genuinely nullable, so null is allowed for those.
        nullable_when_set = {"title", "description", "type"}
        offending = nullable_when_set & self.model_fields_set
        offending = {f for f in offending if getattr(self, f) is None}
        if offending:
            raise ValueError(f"{', '.join(sorted(offending))} cannot be null")
        return self


class BulkApproveRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=50)
