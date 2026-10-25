from datetime import date, datetime

from pydantic import BaseModel


class InitiativeIn(BaseModel):
    title: str
    description: str = ""
    status: str = "planned"
    lead_id: str | None = None
    target_date: date | None = None


class InitiativePatch(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    lead_id: str | None = None
    target_date: date | None = None


class InitiativeOut(BaseModel):
    id: str
    workspace_id: str
    title: str
    description: str
    status: str
    lead_id: str | None
    target_date: date | None
    created_at: datetime


class RollupOut(BaseModel):
    total: int
    done: int
    progress_pct: int
    slip_signal: str          # on_track | at_risk | off_track
    slip_reason: str


class MilestoneIn(BaseModel):
    name: str
    description: str = ""
    status: str = "planned"
    initiative_id: str | None = None
    target_date: date | None = None


class MilestonePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    initiative_id: str | None = None
    target_date: date | None = None


class MilestoneOut(BaseModel):
    id: str
    project_id: str
    initiative_id: str | None
    name: str
    description: str
    status: str
    target_date: date | None
    rollup: RollupOut
    created_at: datetime


class ReleaseIn(BaseModel):
    version: str
    name: str = ""
    status: str = "unreleased"


class ReleasePatch(BaseModel):
    version: str | None = None
    name: str | None = None
    changelog_md: str | None = None
    status: str | None = None


class ReleaseOut(BaseModel):
    id: str
    project_id: str
    version: str
    name: str
    changelog_md: str
    status: str
    released_at: datetime | None
    created_at: datetime


class LinkIn(BaseModel):
    story_ids: list[str]


class DraftIn(BaseModel):
    """Optional override text; if empty, the project's FINAL brief/PRD is used."""
    text: str = ""
