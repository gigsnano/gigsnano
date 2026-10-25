from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator

from gigsnano_api.models import (
    EDigestStatus,
    EDigestTemplate,
    EStoryPriority,
    EStoryStatus,
)


class DigestItemOut(BaseModel):
    story_id: str
    code: str | None
    title: str
    status: EStoryStatus
    priority: EStoryPriority
    target_date: date | None
    project_id: str
    project_name: str
    href: str


class DigestSectionOut(BaseModel):
    """A grouped bucket of the user's pending work, e.g. "overdue"."""

    key: str
    label: str
    count: int
    items: list[DigestItemOut]


class DigestOut(BaseModel):
    """A user's daily digest for one workspace. `ai_summary` is filled in by the
    AI-ranking story (GIN-101); null here."""

    workspace_slug: str
    user_id: str
    generated_at: datetime
    total_open: int
    sections: list[DigestSectionOut]
    ai_summary: str | None = None


class DigestDeliveryOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    run_date: date
    status: EDigestStatus
    channels: list[str]
    item_count: int
    subject: str
    ai_summary: str | None = None
    opened_at: datetime | None
    clicked_at: datetime | None
    created_at: datetime
    # `body_html` is stored on the row but deliberately NOT served here: this is a
    # list endpoint returning up to 500 deliveries, and ~2.5KB of email per row
    # would make it a megabyte-plus response for a log view. Read it from the row
    # when you actually want one specific email.


class DigestRunResultOut(BaseModel):
    run_date: date
    users_processed: int
    sent: int
    skipped: int
    failed: int


class DigestPreferenceOut(BaseModel):
    enabled: bool
    timezone: str
    digest_hour: int
    digest_weekdays: list[int]
    template: EDigestTemplate
    statuses: list[EStoryStatus]
    channels: list[str]


class DigestPreferenceUpdate(BaseModel):
    enabled: bool | None = None
    timezone: str | None = None
    digest_hour: int | None = Field(default=None, ge=0, le=23)
    digest_weekdays: list[int] | None = None
    template: EDigestTemplate | None = None
    statuses: list[EStoryStatus] | None = None
    channels: list[str] | None = None

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, v: str | None) -> str | None:
        """Reject unknown zones at the edge: a bad value stored here would be read
        by the scheduler on every tick, for every user, forever."""
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown IANA timezone: {v!r}") from exc
        return v

    @field_validator("digest_weekdays")
    @classmethod
    def _sane_weekdays(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("digest_weekdays cannot be empty — set enabled=false instead")
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("digest_weekdays must be 0 (Mon) … 6 (Sun)")
        return sorted(set(v))
