"""Capability bundles: the unit an owner composes an agent from.

Bundles exist so a roster row selects from *reviewed groups* of tools rather than
naming tools directly. An owner can compose behaviour; they cannot grant a
capability, which is what keeps `agents` a data table rather than a policy one.
"""

from dataclasses import dataclass

from gigsnano_api.agent.tools.base import Tool, ToolRegistry
from gigsnano_api.agent.tools.belt import build_repo_context_registry
from gigsnano_api.agent.tools.health import build_health_tools
from gigsnano_api.agent.tools.spend import build_spend_tools
from gigsnano_api.agent.tools.work_items import build_work_item_registry
from gigsnano_api.voice.commands import ALLOWED_TOOLS


@dataclass(frozen=True)
class Bundle:
    key: str
    label: str
    description: str
    tools: tuple[Tool, ...]


#: MCP tool name -> runner tool name. Two vocabularies name the same capability:
#: `voice/commands.py::ALLOWED_TOOLS` was written against the MCP surface, while
#: `agent/tools/` names its own. Mapped in one place rather than renamed on either
#: side — renaming the MCP names breaks external clients, renaming the runner's
#: breaks GigsAI. A test asserts every entry resolves. `create_work_item`,
#: `update_work_item` and `add_comment` are identity mappings (same name on both
#: sides) and need no entry here.
VOICE_TOOL_ALIASES: dict[str, str] = {
    "list_work_items": "query_work_items",
    "search_work_items": "query_work_items",
    "get_work_item": "query_work_items",
    "get_work_item_context": "query_work_items",
    "list_my_work_items": "query_work_items",
    "list_projects": "query_work_items",
}


def _tuple(registry: ToolRegistry) -> tuple[Tool, ...]:
    # registry.get() is dict.get() over the registry's own name set, so a name
    # anthropic_defs() just emitted always resolves — but a bundle silently
    # losing a tool to a stray None is exactly the kind of governance bug this
    # module exists to prevent, so it's filtered rather than asserted.
    tools = (registry.get(d["name"]) for d in registry.anthropic_defs())
    return tuple(t for t in tools if t is not None)


BUNDLES: dict[str, Bundle] = {
    "work_items": Bundle(
        key="work_items",
        label="Work items",
        description="Read, create and update work items in this workspace.",
        tools=_tuple(build_work_item_registry()),
    ),
    "project_health": Bundle(
        key="project_health",
        label="Project health & forecast",
        description="Cycle progress, delivery forecast, open blockers and risks.",
        tools=_tuple(build_health_tools()),
    ),
    "spend_time": Bundle(
        key="spend_time",
        label="Spend & time",
        description="Hours logged and AI spend to date.",
        tools=_tuple(build_spend_tools()),
    ),
    "docs_repo": Bundle(
        key="docs_repo",
        label="Docs & repo",
        description="Read project documents and trace the connected repository.",
        tools=_tuple(build_repo_context_registry()),
    ),
}

BUNDLE_KEYS: frozenset[str] = frozenset(BUNDLES)

#: The reviewed voice surface, translated once into runner vocabulary.
_VOICE_RUNNER_TOOLS: frozenset[str] = frozenset(
    VOICE_TOOL_ALIASES.get(name, name) for name in ALLOWED_TOOLS
)


def registry_for(bundles: list[str], *, voice: bool) -> ToolRegistry:
    """The tools an agent may call.

    On a voice session the union is intersected with the reviewed allow-list, so
    composing an agent can never widen what a microphone reaches. Unknown bundle
    keys are skipped rather than raised: a row written before a rename must not
    take the call screen down.
    """
    tools: list[Tool] = []
    for key in bundles:
        bundle = BUNDLES.get(key)
        if bundle is not None:
            tools.extend(bundle.tools)
    if voice:
        tools = [t for t in tools if t.name in _VOICE_RUNNER_TOOLS]
    return ToolRegistry(tools)
