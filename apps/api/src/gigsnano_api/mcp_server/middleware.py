"""ASGI middleware for hosted MCP edge cases."""
from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send


class McpNoSlashMiddleware:
    """Serve ``/mcp`` (no trailing slash) without a 307 redirect.

    MCP clients often POST to ``/mcp``; Starlette's ``Mount`` redirects to
    ``/mcp/`` and may rewrite the host (dropping ``Authorization``). Rewrite
    the path internally and let the normal mount handle the request.
    """

    def __init__(self, app: ASGIApp, *, mcp_app: ASGIApp) -> None:
        self.app = app
        # mcp_app kept for symmetry with create_app wiring; mount handles requests.
        self.mcp_app = mcp_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path") == "/mcp":
            forwarded: Scope = {
                **scope,
                "path": "/mcp/",
                "raw_path": b"/mcp/",
            }
            await self.app(forwarded, receive, send)
            return
        await self.app(scope, receive, send)
