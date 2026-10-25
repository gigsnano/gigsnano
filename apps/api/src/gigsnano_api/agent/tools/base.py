"""Reusable agentic tool types: Tool, ToolContext, ToolResult, ToolRegistry.

Provider stays thin; tool handlers own DB access via ToolContext (never globals).
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.models.workspace import Workspace


@dataclass
class ToolContext:
    db: AsyncSession
    workspace: Workspace
    user: User
    role: str
    # The surface's in-scope project (thread's project). Tools fall back to this
    # when the model passes an empty/unknown project_id, so it can't fumble the id.
    project_id: str | None = None


@dataclass
class ToolResult:
    content: str
    is_error: bool = False
    summary: str | None = None
    # App-relative deep link to what the tool touched (e.g. the work item it
    # created), surfaced by the client next to the result summary.
    link: str | None = None


@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict
    handler: Callable[["ToolContext", dict], Awaitable[ToolResult]]
    mutating: bool = False


class ToolRegistry:
    def __init__(self, tools: list[Tool]) -> None:
        self._tools = {t.name: t for t in tools}

    def anthropic_defs(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }
            for t in self._tools.values()
        ]

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    @classmethod
    def merged(cls, *registries: "ToolRegistry") -> "ToolRegistry":
        tools: list[Tool] = []
        for registry in registries:
            tools.extend(registry._tools.values())
        return cls(tools)
