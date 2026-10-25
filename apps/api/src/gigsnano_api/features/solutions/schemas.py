"""Solution registry + setup-draft API schemas (frontend ISolution* contract)."""

from datetime import datetime

from pydantic import BaseModel


class StartingPointOut(BaseModel):
    key: str
    label: str
    hint: str
    recommended: bool
    requires_capability: str | None


class NavigationEntryOut(BaseModel):
    key: str
    label: str
    path: str
    requires_capability: str | None


class SolutionDefinitionOut(BaseModel):
    key: str
    version: int
    name: str
    outcome: str
    description: str
    container_noun: str
    capabilities: list[str]
    starting_points: list[StartingPointOut]
    navigation: list[NavigationEntryOut]
    availability: str
    availability_reason: str | None


class SolutionRegistryOut(BaseModel):
    revision: str
    solutions: list[SolutionDefinitionOut]


class CreateSetupDraftPayload(BaseModel):
    solution_key: str
    starting_point: str | None = None


class UpdateSetupDraftPayload(BaseModel):
    revision: int
    step: str | None = None
    values: dict | None = None
    starting_point: str | None = None


class SetupDraftOut(BaseModel):
    id: str
    workspace_slug: str
    solution_key: str
    solution_version: int
    starting_point: str | None
    step: str
    values: dict
    created_by: str
    revision: int
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
