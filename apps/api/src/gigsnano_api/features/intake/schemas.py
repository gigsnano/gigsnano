from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CustomerIn(BaseModel):
    name: str
    email: str | None = None
    priority_weight: int = Field(default=0, ge=0, le=3)
    notes: str | None = None


class CustomerOut(BaseModel):
    id: str
    name: str
    email: str | None
    priority_weight: int
    notes: str | None
    created_at: datetime


class TriageCaptureIn(BaseModel):
    """Authenticated capture (personal/private, in-app, or from a Customer)."""
    title: str
    body: str = ""
    source: Literal["personal", "in_app", "customer"] = "personal"
    is_public: bool = False
    project_id: str | None = None
    customer_id: str | None = None


class PublicIntakeIn(BaseModel):
    """Unauthenticated public-form / email submission (workspace from the token)."""
    title: str
    body: str = ""
    email: str | None = None  # optional reporter email, stored as a lightweight Customer


class TriageAcceptIn(BaseModel):
    project_id: str | None = None                      # required if the item has none
    route: Literal["persona", "team", "gig"] | None = None  # defaults to the recommendation
    assignee_id: str | None = None                     # for route == "team"
    status: str = "todo"                               # target Story status


class TriageItemOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str | None
    source: str
    is_public: bool
    status: str
    title: str
    body: str
    customer_id: str | None
    classification: dict
    enriched_title: str | None
    enriched_description: str | None
    priority: str | None
    duplicate_ids: list
    recommended_route: dict
    created_story_id: str | None
    created_at: datetime
    updated_at: datetime


class EnrichedDraft(BaseModel):
    """The Analyst's structured enrichment of a raw request (LLM extract target)."""
    title: str = Field(description="A clear, specific work-item title (<= 120 chars)")
    description: str = Field(description="A concise description with acceptance criteria")
    priority: Literal["urgent", "high", "medium", "low", "none"] = "medium"
