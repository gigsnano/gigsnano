from datetime import datetime

from pydantic import BaseModel


class StickyOut(BaseModel):
    id: str
    workspace_slug: str
    body: str
    color: str
    created_at: datetime
    updated_at: datetime


class CreateStickyPayload(BaseModel):
    body: str = ""
    color: str = "#fbbf24"


class UpdateStickyPayload(BaseModel):
    body: str | None = None
    color: str | None = None
