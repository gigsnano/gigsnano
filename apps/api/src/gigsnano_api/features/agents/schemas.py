from pydantic import BaseModel, ConfigDict, Field, field_validator

from gigsnano_api.agent.tools.bundles import BUNDLE_KEYS


class AgentOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str | None
    name: str
    persona: str
    domain: str
    avatar_color: str
    voice_id: str
    instructions: str
    bundles: list[str]
    is_builtin: bool
    enabled: bool


class _BundleCheck(BaseModel):
    @field_validator("bundles", check_fields=False)
    @classmethod
    def _known_bundles(cls, value: list[str]) -> list[str]:
        # Refused here rather than ignored at dispatch: an agent silently missing
        # the capability its owner picked is worse than a rejected form.
        unknown = [b for b in value if b not in BUNDLE_KEYS]
        if unknown:
            raise ValueError(f"unknown bundles: {sorted(unknown)}")
        return value


class CreateAgentPayload(_BundleCheck):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    persona: str = Field(default="", max_length=80)
    domain: str = Field(default="software", max_length=40)
    avatar_color: str = Field(default="#6b7280", pattern=r"^#[0-9a-fA-F]{6}$")
    voice_id: str = Field(default="", max_length=64)
    instructions: str = ""
    bundles: list[str] = Field(default_factory=list)
    project_id: str | None = None


class UpdateAgentPayload(_BundleCheck):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    persona: str | None = None
    domain: str | None = None
    avatar_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    voice_id: str | None = None
    instructions: str | None = None
    bundles: list[str] | None = None
    enabled: bool | None = None


class BundleOut(BaseModel):
    key: str
    label: str
    description: str
    tool_count: int
