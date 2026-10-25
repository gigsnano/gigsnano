from datetime import datetime
from typing import Literal

from pydantic import BaseModel

InboxKind = Literal[
    "director_action", "recovery_plan", "escalation", "delegation_review", "assignment", "mention"
]
InboxAction = Literal["approve", "reject", "resolve", "retry", "open"]


class InboxItemOut(BaseModel):
    id: str  # "<kind>:<entity_id>", stable across refreshes
    kind: InboxKind
    entity_id: str
    project_id: str | None
    project_name: str | None
    story_id: str | None
    href: str | None
    title: str
    subtitle: str
    created_at: datetime
    actions: list[InboxAction]


class InboxCountsOut(BaseModel):
    approvals: int  # director actions + recovery plans + delegation reviews
    escalations: int
    assigned: int  # unread assignment + mention notifications
    total: int


class InboxOut(BaseModel):
    items: list[InboxItemOut]
    counts: InboxCountsOut
