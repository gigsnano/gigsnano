from datetime import datetime

from pydantic import BaseModel, Field


class ExpertOut(BaseModel):
    id: str
    name: str
    persona: str
    domain: str
    avatar_color: str


class RoomMessageOut(BaseModel):
    id: str
    role: str
    speaker: str | None
    content: str
    created_at: datetime


class RoomOut(BaseModel):
    id: str
    workspace_slug: str
    title: str
    participant_agent_ids: list[str]
    messages: list[RoomMessageOut]
    created_at: datetime
    updated_at: datetime


class CreateRoomPayload(BaseModel):
    title: str = "New room"
    participant_agent_ids: list[str] = Field(default_factory=list)


class AddParticipantPayload(BaseModel):
    agent_id: str


class AdvanceRoomPayload(BaseModel):
    content: str | None = None
