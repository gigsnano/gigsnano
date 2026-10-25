from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from gigsnano_api.models import (
    EAgentConnectionStatus,
    EAgentProvider,
    EDelegationStatus,
    EDelegationUnit,
)


class ConnectionOut(BaseModel):
    """Frontend IAgentConnection. Never includes the token."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    provider: EAgentProvider
    account_label: str
    status: EAgentConnectionStatus
    connected_at: datetime


class InstallUrlOut(BaseModel):
    url: str


class OAuthCallbackPayload(BaseModel):
    code: str
    state: str


class CursorApiKeyPayload(BaseModel):
    api_key: str


class CreateDelegationPayload(BaseModel):
    unit_type: EDelegationUnit
    unit_id: str
    connection_id: str
    custom_prompt: str | None = None


class DelegationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    unit_type: EDelegationUnit
    unit_id: str
    workspace_slug: str
    project_id: str
    provider: EAgentProvider
    connection_id: str | None
    delegated_by: str
    status: EDelegationStatus
    custom_prompt: str | None
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime


class LaunchPayload(BaseModel):
    """Control-plane "Accept & run" (GIN-342): which connected agent to launch to.
    The pinned skills come from the work item's stored Execution Profile."""

    connection_id: str


class LaunchOut(BaseModel):
    run_id: str          # the telemetry AgentRun
    agent: str           # the profile's resolved target agent
    required: list[str]  # required pinned skills (the completion gate reads these)
    delegation: DelegationOut
