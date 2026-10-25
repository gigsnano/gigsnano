from typing import Literal

from pydantic import BaseModel


class PersistProfilePayload(BaseModel):
    agent: Literal["auto", "claude-code", "codex", "cursor"] = "auto"
    policy: Literal["suggest", "locked"] | None = None


class OverrideChange(BaseModel):
    skillId: str
    mode: str  # required | recommended | prohibited | removed


class OverridePayload(BaseModel):
    changes: list[OverrideChange]
    reason: str = ""
