from datetime import datetime
from typing import Literal

from pydantic import BaseModel

_Status = Literal["", "todo", "in_progress", "in_review", "done"]


class WorkflowRuleIn(BaseModel):
    from_status: _Status = ""                                  # "" = any source state
    to_status: Literal["todo", "in_progress", "in_review", "done"]
    approver_kind: Literal["human", "persona"]
    approver_ref: str                                          # role name | BMAD agent id
    on_concerns: Literal["block", "warn", "allow"] = "block"
    enabled: bool = True


class WorkflowRuleOut(BaseModel):
    id: str
    from_status: str
    to_status: str
    approver_kind: str
    approver_ref: str
    on_concerns: str
    enabled: bool
    created_at: datetime


class GateDecisionOut(BaseModel):
    id: str
    story_id: str
    from_status: str
    to_status: str
    approver_kind: str
    approver_ref: str
    verdict: str
    allowed: bool
    rationale: str
    created_at: datetime
