from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# The action allowlist lives here as a Literal — the pydantic schema IS the
# sandbox boundary; anything the LLM can't map goes into `unsupported`, never an
# out-of-catalog action. `notify`/`slack_post` are intentionally absent (they need
# a notification-template key / a threaded Slack sender) so they're flagged, not run.
ActionType = Literal[
    "set_field", "assign_persona", "create_work_item", "comment", "create_from_template"
]
TriggerEvent = Literal["story.created", "story.updated", "schedule"]


class Condition(BaseModel):
    field: str                                              # a field on the event payload (e.g. type, priority)
    op: Literal["eq", "neq", "contains", "in"] = "eq"
    value: str | list[str]


class Action(BaseModel):
    type: ActionType
    params: dict = Field(default_factory=dict)


class AutomationAst(BaseModel):
    trigger: TriggerEvent
    conditions: list[Condition] = []
    actions: list[Action] = []
    # Anything the request asked for that isn't in the allowlist — surfaced for the
    # human, never silently dropped (GIN-252 acceptance).
    unsupported: list[str] = []


class CompileIn(BaseModel):
    text: str


class AutomationIn(BaseModel):
    name: str
    text: str
    enabled: bool = True


class AutomationPatch(BaseModel):
    name: str | None = None
    enabled: bool | None = None


class AutomationOut(BaseModel):
    id: str
    project_id: str
    name: str
    source_text: str
    trigger_event: str
    ast: dict
    enabled: bool
    created_at: datetime


class DryRunIn(BaseModel):
    event_data: dict = Field(default_factory=dict)


class AutomationRunOut(BaseModel):
    id: str
    automation_id: str | None
    trigger_event: str
    story_id: str | None
    dry_run: bool
    status: str
    actions_taken: list
    created_at: datetime
