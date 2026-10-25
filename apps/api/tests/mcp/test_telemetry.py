"""GIN-367: per-tool-call telemetry."""

import logging

import pytest

from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.mcp_server.server import mcp

_EXPECTED_FIELDS = {
    "tool",
    "request_id",
    "duration_ms",
    "outcome",
    "error_code",
    "response_chars",
    "workspace",
    "principal_class",
    "schema_version",
    "api_version",
}


def _last_metric(caplog):
    recs = [r for r in caplog.records if r.name == "gigsnano.mcp.telemetry"]
    assert recs, "expected a telemetry line"
    return recs[-1].mcp


@pytest.mark.asyncio
async def test_tool_call_emits_measured_telemetry(pat_for_user, seed_story, caplog):
    set_bearer(pat_for_user.token)
    with caplog.at_level(logging.INFO, logger="gigsnano.mcp.telemetry"):
        await mcp._tool_manager.call_tool(
            "get_work_item", {"code": seed_story.code}, convert_result=True
        )
    fields = _last_metric(caplog)

    assert fields["tool"] == "get_work_item"
    assert fields["outcome"] == "ok"
    assert fields["request_id"].startswith("req_")
    assert fields["workspace"] == "acme"
    assert fields["duration_ms"] >= 0
    # exactly the metric shape — no request/response content leaks into telemetry
    assert set(fields) == _EXPECTED_FIELDS


@pytest.mark.asyncio
async def test_error_telemetry_carries_structured_code(pat_for_user, caplog):
    set_bearer(pat_for_user.token)
    with caplog.at_level(logging.INFO, logger="gigsnano.mcp.telemetry"):
        with pytest.raises(Exception):
            await mcp._tool_manager.call_tool(
                "get_work_item", {"code": "MBA-99999"}, convert_result=True
            )
    fields = _last_metric(caplog)
    assert fields["tool"] == "get_work_item"
    assert fields["outcome"] == "error"
    assert fields["error_code"]  # e.g. http_404, unwrapped from the ToolError cause
