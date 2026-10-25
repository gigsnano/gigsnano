"""Skills as MCP prompts (GIN-392).

The workspace skill registry (GIN-284) held 14 skills that no client could see:
we exposed them only through `list_skills`/`get_skill_manifest` *tools*, so they
appeared as two more API actions instead of as capabilities. Clients render
prompts as a separate group ("Skills"/"Prompts") from tools, so each visible
registry skill is published as one prompt whose body is its SKILL.md.

The list is per-caller (workspace-scoped, same authorization as list_skills), so
the handlers are registered on the low-level server rather than through FastMCP's
static prompt manager.
"""

from __future__ import annotations

import logging

from gigsnano_api.mcp_server.api import ApiError, api, default_workspace
from mcp import types

logger = logging.getLogger("gigsnano.mcp.prompts")

_ARGUMENTS = [
    types.PromptArgument(
        name="work_item",
        description="Work-item code to apply the skill to, e.g. GIN-392.",
        required=False,
    ),
    types.PromptArgument(
        name="project",
        description="Project id, or 'workspace_slug/project_id'.",
        required=False,
    ),
]


def _latest(pkg: dict) -> dict | None:
    """The newest non-revoked version, or None when the skill has none runnable."""
    from gigsnano_api.mcp_server.tools.skills import _semver_key

    runnable = [v for v in pkg.get("versions", []) if v["lifecycle"] != "revoked"]
    return max(runnable, key=lambda v: _semver_key(v["version"])) if runnable else None


async def _visible_skills() -> tuple[str, list[dict]]:
    slug = await default_workspace()
    return slug, await api("GET", f"/workspaces/{slug}/skills/")


async def list_prompts() -> list[types.Prompt]:
    try:
        _, rows = await _visible_skills()
    except ApiError:
        # No workspace / no access is an empty capability list, never a broken
        # connection — clients call this during connect, before any tool call.
        logger.info("skill prompts unavailable for this principal", exc_info=True)
        return []
    prompts = []
    for pkg in rows:
        version = _latest(pkg)
        if version is None:
            continue
        description = (version.get("manifest") or {}).get("description") or pkg["name"]
        prompts.append(
            types.Prompt(
                name=pkg["name"],
                title=pkg["name"].replace("-", " ").capitalize(),
                description=description,
                arguments=_ARGUMENTS,
            )
        )
    return prompts


async def get_prompt(name: str, arguments: dict[str, str] | None) -> types.GetPromptResult:
    slug, rows = await _visible_skills()
    pkg = next((p for p in rows if p["name"] == name), None)
    version = _latest(pkg) if pkg else None
    if version is None:
        raise ValueError(f"Unknown skill: {name}")
    detail = await api(
        "GET", f"/workspaces/{slug}/skills/versions/{version['id']}/instructions/"
    )

    body = [detail.get("skill_md") or ""]
    args = arguments or {}
    if args.get("work_item"):
        body.append(
            f"Apply this skill to work item {args['work_item']}. Read it first with "
            "get_work_item / get_work_item_context before proposing any change."
        )
    if args.get("project"):
        body.append(f"Scope: project {args['project']}.")

    return types.GetPromptResult(
        description=(version.get("manifest") or {}).get("description") or name,
        messages=[
            types.PromptMessage(
                role="user",
                content=types.TextContent(type="text", text="\n\n".join(body).strip()),
            )
        ],
    )


def install_prompts(mcp) -> None:
    """Replace FastMCP's static (always-empty) prompt handlers with the registry."""
    mcp._mcp_server.list_prompts()(list_prompts)
    mcp._mcp_server.get_prompt()(get_prompt)
