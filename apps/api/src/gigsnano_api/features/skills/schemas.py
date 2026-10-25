from typing import Literal

from pydantic import BaseModel, Field


class PublishSkill(BaseModel):
    name: str = Field(max_length=120)
    version: str = Field(max_length=20)
    visibility: Literal["public", "private"] = "private"
    files: dict[str, str]  # {relpath: text}; SKILL.md required
    manifest: dict = Field(default_factory=dict)  # description/trigger/compat/tools/tags/deps/conflicts/risk


class LifecycleTransition(BaseModel):
    to: str  # reviewed | approved | deprecated | revoked


class SkillVersionOut(BaseModel):
    id: str
    version: str
    digest: str
    byte_size: int
    manifest: dict
    lifecycle: str


class SkillOut(BaseModel):
    id: str
    name: str
    visibility: str
    owner_workspace_id: str | None
    versions: list[SkillVersionOut] = []
