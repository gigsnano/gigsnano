from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StartSessionPayload(BaseModel):
    locale: str = "en-US"
    agent_profile_version: int = 1


class HeartbeatPayload(BaseModel):
    """Both fields are acknowledgements: the client is reporting what it has
    committed to, which is what reconnect is allowed to restore."""

    transcript_final: str | None = None
    draft: dict[str, Any] | None = None


class SessionCredential(BaseModel):
    session_id: str
    #: Our short-lived session grant. Never a provider key — see service.py.
    token: str
    expires_at: str
    locale: str
    agent_profile_version: int
    epoch: int = Field(description="Bumped on reconnect; older tokens stop working.")


class SpeakPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    #: Which roster voice to use. Empty defers to the session locale's default.
    agent_id: str = ""


class TurnPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcript: str
    agent_id: str
    #: Nullable, not `str = ""`: the client sends `agent.project_id` straight
    #: through, and a workspace-wide agent (every seeded one) has that as JSON
    #: `null`. With `extra="forbid"` and a `str` annotation that is a 422 on the
    #: first utterance of every call. `None` and `""` both mean "no project".
    project_id: str | None = None


class ConfirmPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hash: str
