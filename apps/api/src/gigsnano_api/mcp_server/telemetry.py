"""Request-level MCP telemetry (GIN-367).

Wraps the single tool-call chokepoint (`ToolManager.call_tool`) so every MCP
tool invocation emits one structured metric line: tool, workspace, duration,
outcome, error code and a coarse response size — enough to compute per-tool
p50/p95/p99 latency and error rates, and to catch oversized responses, from the
transport itself rather than inferring from application logs.

Deliberately records NO request or response content — no titles, descriptions,
comment bodies, tokens or user data — only the shape of the call (GIN-367 AC3).
The per-call request_id is forwarded to the API as X-Request-ID so application
and DB traces correlate to the same line.
"""
from __future__ import annotations

import logging
import time
from uuid import uuid4

from gigsnano_api.mcp_server.api import (
    API_VERSION,
    SCHEMA_VERSION,
    ApiError,
    _current_workspace,
    _request_id,
)

logger = logging.getLogger("gigsnano.mcp.telemetry")

# A principal class, never the principal — telemetry must not become a user log.
_PRINCIPAL = "mcp_pat"


def install_telemetry(mcp) -> None:
    """Wrap the tool manager's call_tool so every invocation is measured. Idempotent
    — a second install is a no-op (guards against re-import in tests)."""
    tm = mcp._tool_manager
    if getattr(tm, "_gn_telemetry_installed", False):
        return
    original = tm.call_tool

    async def instrumented(name, arguments, context=None, convert_result=False):
        request_id = f"req_{uuid4().hex}"
        _request_id.set(request_id)
        _current_workspace.set(None)  # resolved during the call, read at the end
        start = time.perf_counter()
        outcome = "ok"
        error_code: str | None = None
        result = None
        try:
            result = await original(
                name, arguments, context=context, convert_result=convert_result
            )
            return result
        except Exception as exc:
            outcome = "error"
            # Tool.run wraps the failure in ToolError(... from e); the actionable
            # ApiError (with its stable error_code) is the __cause__.
            cause = exc.__cause__ if isinstance(exc.__cause__, ApiError) else exc
            if isinstance(cause, ApiError):
                error_code = (
                    cause.detail.get("error_code") if isinstance(cause.detail, dict) else None
                ) or f"http_{cause.status}"
            else:
                error_code = "internal"
            raise
        finally:
            _emit(
                tool=name,
                request_id=request_id,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
                outcome=outcome,
                error_code=error_code,
                # Coarse size proxy for oversized-response alerts; never the content.
                response_chars=len(str(result)) if result is not None else 0,
            )

    tm.call_tool = instrumented
    tm._gn_telemetry_installed = True


def _emit(**fields) -> None:
    fields.update(
        workspace=_current_workspace.get(),
        principal_class=_PRINCIPAL,
        schema_version=SCHEMA_VERSION,
        api_version=API_VERSION,
    )
    # One structured line per call; a log processor / dashboard aggregates the
    # latency and error-rate distributions per tool + workspace (see the runbook).
    logger.info("mcp_tool_call", extra={"mcp": fields})
