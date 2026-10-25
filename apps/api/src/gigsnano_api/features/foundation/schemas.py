from pydantic import BaseModel, Field


class LockFoundationPayload(BaseModel):
    """Lock via a curated preset_key, OR bring your own stack (the custom fields)."""

    preset_key: str | None = None
    allowed_libraries: list[str] | None = None
    enforce_design_tokens: bool | None = None
    quality_gates: list[str] | None = None
    database: str | None = None
    architecture: str | None = None


class ValidateFoundationPayload(BaseModel):
    diff: str
    gate_results: dict[str, bool] = Field(default_factory=dict)


class FoundationOut(BaseModel):
    project_id: str
    preset_key: str
    allowed_libraries: list[str]
    enforce_design_tokens: bool
    quality_gates: list[str]
    database: str
    architecture: str
    pinned_artifacts: list[str]
    status: str
    version: int
    # Living Foundation (GIN-196): prior version snapshots + a pending proposed change.
    history: list[dict] = Field(default_factory=list)
    pending_change: dict | None = None


class ArtifactOut(BaseModel):
    id: str
    artifact_type: str
    name: str
    version: str
    visibility: str
    payload: str


class CreateArtifactPayload(BaseModel):
    artifact_type: str
    name: str
    version: str | None = None
    visibility: str = "private"
    payload: str | None = None


class SetPinsPayload(BaseModel):
    pinned_artifacts: list[str]


class ViolationOut(BaseModel):
    rule: str
    file: str
    line: int
    blocking: bool
    detail: str


class ValidationResultOut(BaseModel):
    status: str
    violations: list[ViolationOut]


class StackDetectionOut(BaseModel):
    suggested_preset: str | None
