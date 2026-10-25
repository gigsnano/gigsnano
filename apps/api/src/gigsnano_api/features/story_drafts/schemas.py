from datetime import datetime

from pydantic import BaseModel, Field


class StoryDraftUpsert(BaseModel):
    title: str = ""
    payload: dict = Field(default_factory=dict)


class StoryDraftOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str
    title: str
    payload: dict
    created_at: datetime
    updated_at: datetime
