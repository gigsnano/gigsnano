from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any

import httpx
from starlette.types import ASGIApp

from gigsnano_api.mcp_server.auth import get_bearer

_app: ASGIApp | None = None

#: Response-envelope contract version (GIN-366). Bump when the meta/result shape
#: changes so clients can gate on it; the wire tests pin it.
SCHEMA_VERSION = "1.1"

try:  # the running service version, for response correlation (GIN-366/GIN-367)
    from importlib.metadata import version as _pkg_version

    API_VERSION = _pkg_version("gigsnano-api")
except Exception:  # noqa: BLE001 — version metadata is best-effort, never fatal
    API_VERSION = "unknown"

#: The workspace the current tool call resolved to. Set once by default_workspace()
#: / resolve_ctx() and read by the telemetry layer so every logged call carries its
#: workspace without threading the slug through ~40 call sites.
_current_workspace: ContextVar[str | None] = ContextVar("mcp_current_workspace", default=None)

#: Per-tool-call correlation id (GIN-366/GIN-367). Set by the telemetry wrapper and
#: forwarded to the API as X-Request-ID so MCP, application and DB traces share it.
_request_id: ContextVar[str | None] = ContextVar("mcp_request_id", default=None)


def _get_app() -> ASGIApp:
    global _app
    if _app is None:
        from gigsnano_api.app import create_app

        _app = create_app()
    return _app


class ApiError(Exception):
    def __init__(self, status: int, detail: Any):
        # A structured backend error (GIN-366/GIN-368) arrives as a dict with a
        # stable error_code + retryable flag. Surface those in the message so the
        # agent sees actionable, machine-readable failure info — not an opaque
        # string — while keeping the full dict on .detail for programmatic use.
        if isinstance(detail, dict) and detail.get("error_code"):
            message = (
                f"[{detail['error_code']}] {detail.get('message', '')}"
                f" (retryable={str(bool(detail.get('retryable'))).lower()})"
            )
        else:
            message = detail if isinstance(detail, str) else json.dumps(detail)
        super().__init__(message)
        self.status = status
        self.detail = detail


async def api(method: str, path: str, json_body: dict | None = None) -> Any:
    headers = {"Authorization": f"Bearer {get_bearer()}"}
    # Forward the tool-call correlation id so the API (and its DB traces) share it
    # with the MCP telemetry log for the same request (GIN-367).
    request_id = _request_id.get()
    if request_id:
        headers["X-Request-ID"] = request_id
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_get_app()), base_url="http://mcp.internal"
    ) as client:
        response = await client.request(method, f"/api{path}", json=json_body, headers=headers)
    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("detail", detail)
        except ValueError:
            pass  # not a JSON body — the raw text above is already the detail
        raise ApiError(response.status_code, detail)
    return None if response.status_code == 204 else response.json()


#: What a tool hands back. FastMCP renders it to the JSON text block *and* to
#: structuredContent, so returning the object rather than a JSON string is what
#: stops clients having to parse twice (reported on GIN-270).
TPayload = dict[str, Any] | list[Any]


def text(obj: TPayload) -> TPayload:
    """Return a tool payload as a native object (GIN-270).

    Kept native deliberately: FastMCP renders this to structuredContent directly,
    so returning the object (not `json.dumps(obj)`) is what stops clients parsing
    JSON inside JSON. GIN-366's response identity (request_id, schema/api version,
    workspace) is delivered as telemetry/correlation (GIN-367), not by wrapping the
    result — which would break the native contract every existing tool test pins.
    """
    return obj


async def resolve_ctx(project: str | None) -> tuple[str, str]:
    """Resolve "workspace_slug/project_id", or a bare project id.

    A bare id is resolved against the active workspace (GIN-174). Rejecting it
    was pure ceremony: the caller almost always has an id from get_work_item or
    list_projects and no reason to think a slug is required, so the 400 just
    bought a wasted round-trip.
    """
    if project and "/" in project:
        slug, pid = project.split("/", 1)
        if slug and pid:
            _current_workspace.set(slug)
            return slug, pid
    if project:
        return await default_workspace(), project
    raise ApiError(400, "Specify a project id, or 'workspace_slug/project_id' (see list_projects).")


async def default_workspace() -> str:
    rows = await api("GET", "/workspaces/")
    slugs = [w["slug"] for w in rows]
    if not slugs:
        raise ApiError(400, "You have no workspaces.")
    if len(slugs) == 1:
        _current_workspace.set(slugs[0])
        return slugs[0]
    # Multiple workspaces: never guess. Use the workspace the user explicitly selected
    # via set_active_workspace (like `az account set`); if none is set, refuse and ask.
    me = await api("GET", "/auth/me/")
    active = me.get("mcp_active_workspace_slug") if isinstance(me, dict) else None
    if active and active in slugs:
        _current_workspace.set(active)
        return active
    raise ApiError(
        409,
        "No active workspace selected. You belong to multiple workspaces: "
        f"{', '.join(slugs)}. Ask the user which one, then call "
        "set_active_workspace('<slug>') to select it (persists until changed). "
        "Alternatively pass project='slug/project_id' on tools that accept it.",
    )
