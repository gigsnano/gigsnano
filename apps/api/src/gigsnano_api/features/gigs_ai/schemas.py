from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

DEFAULT_GIGS_MODEL = "sonnet-5"

# GigsAI never runs on Opus. Stale clients may still send the retired
# "opus-4-8" id; coerce it rather than 422 the request.
GigsAiModelLiteral = Annotated[
    Literal["sonnet-5", "haiku-4-5"],
    BeforeValidator(lambda v: DEFAULT_GIGS_MODEL if v == "opus-4-8" else v),
]


class GigsMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    created_at: datetime


class GigsThreadOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str | None
    title: str
    model: str
    messages: list[GigsMessageOut]
    created_at: datetime
    updated_at: datetime


class CreateGigsThreadPayload(BaseModel):
    project_id: str | None = None
    model: GigsAiModelLiteral = DEFAULT_GIGS_MODEL


class UpdateGigsThreadPayload(BaseModel):
    title: str | None = None
    model: GigsAiModelLiteral | None = None


class GigsInlineAttachmentPayload(BaseModel):
    title: str
    file_name: str
    mime_type: str
    content: str


class SendGigsMessagePayload(BaseModel):
    content: str
    agent_id: str | None = None
    document_ids: list[str] = Field(default_factory=list)
    attachments: list[GigsInlineAttachmentPayload] = Field(default_factory=list)


class ToolDecisionPayload(BaseModel):
    tool_use_id: str
    approved: bool


class ConfirmToolsPayload(BaseModel):
    decisions: list[ToolDecisionPayload]
