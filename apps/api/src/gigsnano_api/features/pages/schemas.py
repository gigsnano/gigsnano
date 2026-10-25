from datetime import datetime

from pydantic import BaseModel, Field


class PageOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str
    title: str
    content: str
    content_format: str = "html"
    created_at: datetime
    updated_at: datetime


class CreatePagePayload(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = ""
    content_format: str | None = None


class UpdatePagePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: str | None = None
    content_format: str | None = None
    # Optimistic-concurrency guard (GIN-24 presence v1): pass back the
    # `updated_at` you loaded the page with. A mismatch means someone else
    # saved in between -> 409 instead of a silent last-write-wins clobber.
    if_updated_at: datetime | None = None


class PagePresenceHeartbeat(BaseModel):
    editing: bool = False


class PagePresenceViewer(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None
    editing: bool
    last_seen: datetime


class PagePresenceOut(BaseModel):
    viewers: list[PagePresenceViewer]
