from pydantic import BaseModel, Field

from gigsnano_api.models.skill_events import ESkillEventState


class RecordEventPayload(BaseModel):
    skill_id: str = Field(max_length=120)
    state: ESkillEventState
    dedupe_key: str = Field(max_length=200)
    # Bounded to the column widths so an over-long value is a clean 422, not a
    # Postgres StringDataRightTruncation 500.
    version: str | None = Field(default=None, max_length=20)
    digest: str | None = Field(default=None, max_length=71)
    agent: str | None = Field(default=None, max_length=20)
    gate: str | None = Field(default=None, max_length=60)
    evidence: list[dict] = Field(default_factory=list)
    reason: str | None = Field(default=None, max_length=500)


class SkillEventOut(BaseModel):
    id: str
    skill_id: str
    state: str
    version: str | None
    digest: str | None
    agent: str | None
    gate: str | None
    evidence: list
    reason: str | None


class EventsOut(BaseModel):
    events: list[SkillEventOut]
    current_states: dict[str, str]


class GateRequest(BaseModel):
    required_skills: list[str] = Field(default_factory=list)
    gates: list[str] = Field(default_factory=list)
