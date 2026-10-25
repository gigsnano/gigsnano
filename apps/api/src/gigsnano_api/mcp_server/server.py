# mcp SDK 1.28.1 symbols:
#   from mcp.server.fastmcp import FastMCP
#   from mcp.server.auth.settings import AuthSettings
#   from mcp.server.auth.provider import TokenVerifier, AccessToken
#   mcp.streamable_http_app() -> Starlette
from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl

from gigsnano_api.core.config import settings
from gigsnano_api.mcp_server.auth import PatTokenVerifier

DESCRIPTIONS: dict[str, str] = {}  # filled per tool in tools.py

_api_origin = (settings.public_base_url or settings.app_base_url).rstrip("/")
_frontend = settings.frontend_url.rstrip("/") if settings.frontend_url else ""
if settings.public_base_url and _frontend and _api_origin != _frontend:
    # Frontend proxies /oauth/* and /mcp on app.gigsnano.com — issuer must match discovery.
    _api_origin = _frontend
if _api_origin.endswith(":3000") and not settings.public_base_url:
    _api_origin = "http://localhost:8020"

mcp = FastMCP(
    name="gigsnano",
    stateless_http=True,
    streamable_http_path="/",
    json_response=True,
    token_verifier=PatTokenVerifier(),
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(f"{_api_origin}/"),
        resource_server_url=AnyHttpUrl(f"{_api_origin}/mcp"),
        required_scopes=["mcp"],
    ),
)

# Instrument every tool call at the single chokepoint (GIN-367). Done here so it's
# active regardless of when the tools module registers its tools.
from gigsnano_api.mcp_server.telemetry import install_telemetry  # noqa: E402

install_telemetry(mcp)

_mcp_asgi_app = None


def reset_mcp_runtime() -> None:
    """Test-only: allow the streamable HTTP session manager to start again."""
    global _mcp_asgi_app
    _mcp_asgi_app = None
    mcp._session_manager = None


def build_mcp_app():
    global _mcp_asgi_app
    if _mcp_asgi_app is None:
        _mcp_asgi_app = mcp.streamable_http_app()
    return _mcp_asgi_app


@contextlib.asynccontextmanager
async def mcp_session_lifespan() -> AsyncIterator[None]:
    build_mcp_app()
    async with mcp._session_manager.run():
        yield
