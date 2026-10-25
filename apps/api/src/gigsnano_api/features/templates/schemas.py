from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TemplateIn(BaseModel):
    kind: Literal["project", "work_item"]
    name: str
    visibility: Literal["private", "public"] = "private"
    content: dict = Field(default_factory=dict)


class TemplatePatch(BaseModel):
    name: str | None = None
    visibility: Literal["private", "public"] | None = None
    content: dict | None = None


class TemplateOut(BaseModel):
    id: str
    workspace_id: str
    kind: str
    name: str
    visibility: str
    content: dict
    version: int
    created_at: datetime


class DraftIn(BaseModel):
    text: str


class RecurrenceIn(BaseModel):
    template_id: str
    every: int = Field(ge=1)
    unit: Literal["minutes", "hours", "days"]


class RecurrenceOut(BaseModel):
    id: str
    name: str
    template_id: str | None
    every: int | None
    unit: str | None
    next_run_at: datetime | None
    enabled: bool
    created_at: datetime
