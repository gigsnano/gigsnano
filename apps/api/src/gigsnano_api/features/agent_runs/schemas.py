from datetime import datetime

from pydantic import BaseModel


class AgentRunStepOut(BaseModel):
    id: str
    seq: int
    kind: str
    status: str
    summary: str
    payload: dict
    tokens: int
    created_at: datetime


class AgentRunOut(BaseModel):
    id: str
    story_id: str
    persona_id: str
    autonomy: str
    state: str
    cost_tokens: int
    cost_usd: float
    created_at: datetime
    updated_at: datetime
    steps: list[AgentRunStepOut]


class AgentResourceOut(BaseModel):
    id: str
    name: str
    persona: str
    phase: str
    skills: list[str]
    capacity: int
    active_load: int
    cost_tokens: int
    cost_usd: float


class RoutingCitationOut(BaseModel):
    type: str
    ref: str


class RoutingOut(BaseModel):
    domain: str
    task_type: str
    persona_id: str
    persona_name: str
    skills: list[str]
    confidence: str
    rationale: str
    citations: list[RoutingCitationOut]


class CandidateOut(BaseModel):
    type: str  # "agent" | "human"
    id: str
    name: str
    score: int
    reason: str
    est_rate: int | None


class GigStateOut(BaseModel):
    published: bool
    listing_id: str | None
    # none | open | held | in_review | released | refunded
    escrow_state: str | None
    amount_cents: int | None
