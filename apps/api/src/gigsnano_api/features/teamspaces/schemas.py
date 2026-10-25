from datetime import datetime

from pydantic import BaseModel, Field


class TeamspaceIn(BaseModel):
    name: str
    description: str = ""
    pinned_artifacts: list[str] = Field(default_factory=list)
    member_ids: list[str] = Field(default_factory=list)
    project_ids: list[str] = Field(default_factory=list)


class TeamspacePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    pinned_artifacts: list[str] | None = None


class TeamspaceOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str
    pinned_artifacts: list
    member_ids: list[str]
    project_ids: list[str]
    created_at: datetime


class SetIdsIn(BaseModel):
    ids: list[str]


class RollupOut(BaseModel):
    total: int
    done: int
    progress_pct: int
