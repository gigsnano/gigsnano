"""Contract tests for the read-only codebase-intelligence MCP tools (GIN-280).

They exercise the tool layer end-to-end: set_bearer -> tool -> in-process FastAPI
(real project authorization) -> DB artifacts. Covers unauthorized, unindexed
(none), ready/success, filter, pagination, and evidence resolution.
"""

import json

import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.models import ECodeArtifactKind, EIndexStatus, Project

from tests.helpers import seed_code_artifact

_GRAPH = {
    "nodes": [
        {"id": "src/auth/login.py:login", "source_file": "src/auth/login.py", "kind": "function", "label": "login"},
        {"id": "src/billing/charge.py:charge", "source_file": "src/billing/charge.py", "kind": "function", "label": "charge"},
    ],
    "edges": [],
}
_METRICS = {
    "totals": {"files": 2, "loc": 100},
    "languages": [{"name": "Python", "loc": 100}],
    "languages_source": "scc",
    "complexity": {"buckets": [], "worst": [{"name": "charge", "file": "src/billing/charge.py", "ccn": 30}]},
    "duplication": {"percent": 4.0},
    "hotspots": [],
    "dependencies": {"cycles": []},
    "issues": {"counts": {"error": 1, "warning": 0, "info": 0}, "by_rule": [], "top": []},
}
_ISSUES = {"issues": [{"rule": "py.sql-injection", "severity": "ERROR", "file": "a.py", "line": 3, "message": "raw SQL"}], "truncated": False}
_CHANGES = {"commits": [
    {"sha": "aaaaaaaa11", "author": "Ada", "message": "init", "committed_at": "2026-07-10T00:00:00Z"},
    {"sha": "bbbbbbbb22", "author": "Ada", "message": "feature", "committed_at": "2026-07-18T00:00:00Z"},
]}


async def _make_ready(db_session, project_id, **artifacts):
    p = await db_session.get(Project, project_id)
    p.index_status = EIndexStatus.READY
    p.indexed_commit_sha = "aaaaaaaa11"
    await db_session.commit()
    for kind, data in artifacts.items():
        await seed_code_artifact(db_session, project_id, ECodeArtifactKind(kind), data)


async def test_overview_unindexed_returns_none_not_error(pat_for_user, seed_project):
    """The overview tool must never error on an unindexed repo."""
    set_bearer(pat_for_user.token)
    out = await tools.get_codebase_overview(project=seed_project.id)
    assert out["state"] == "none"
    assert out["index"]["status"] == "none"


async def test_overview_ready_aggregates(pat_for_user, seed_project, db_session):
    set_bearer(pat_for_user.token)
    await _make_ready(db_session, seed_project.id, graph=_GRAPH, metrics=_METRICS)
    out = await tools.get_codebase_overview(project=seed_project.id)
    assert out["state"] == "ready"
    assert out["counts"]["symbols"] == 2


async def test_architecture_returns_modules_and_dimension(pat_for_user, seed_project, db_session):
    set_bearer(pat_for_user.token)
    await _make_ready(db_session, seed_project.id, graph=_GRAPH, metrics=_METRICS)
    out = await tools.get_codebase_architecture(project=seed_project.id)
    assert {m["key"] for m in out["modules"]} >= {"src/auth", "src/billing"}
    assert out["architecture"]["key"] == "architecture"


async def test_list_risks_filters_and_paginates(pat_for_user, seed_project, db_session):
    set_bearer(pat_for_user.token)
    await _make_ready(db_session, seed_project.id, metrics=_METRICS, issues=_ISSUES)
    all_out = await tools.list_codebase_risks(project=seed_project.id)
    assert all_out["total"] >= 1
    crit = await tools.list_codebase_risks(project=seed_project.id, severity="critical")
    assert all(r["severity"] == "critical" for r in crit["items"])
    paged = await tools.list_codebase_risks(project=seed_project.id, limit=1)
    assert paged["returned"] == 1
    assert paged["truncated"] == (all_out["total"] > 1)


async def test_list_risks_rejects_bad_limit(pat_for_user, seed_project):
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError):
        await tools.list_codebase_risks(project=seed_project.id, limit=99999)


async def test_repository_changes_since_filter(pat_for_user, seed_project, db_session):
    set_bearer(pat_for_user.token)
    await _make_ready(db_session, seed_project.id, changes=_CHANGES)
    out = await tools.list_repository_changes(project=seed_project.id)
    assert out["total"] == 2
    since = await tools.list_repository_changes(project=seed_project.id, since="2026-07-15T00:00:00Z")
    assert since["total"] == 1
    assert since["items"][0]["sha"] == "bbbbbbbb22"


async def test_trace_feature_matches_symbols(pat_for_user, seed_project, db_session):
    set_bearer(pat_for_user.token)
    await _make_ready(db_session, seed_project.id, graph=_GRAPH)
    out = await tools.trace_codebase_feature(project=seed_project.id, query="login")
    assert out["returned"] == 1
    assert out["matches"][0]["file"] == "src/auth/login.py"


async def test_trace_feature_errors_pre_index(pat_for_user, seed_project):
    """Graph-backed tools surface the index-not-ready 409 as an error."""
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError) as exc:
        await tools.trace_codebase_feature(project=seed_project.id, query="login")
    assert exc.value.status == 409


async def test_evidence_resolves_and_reports_unknown(pat_for_user, seed_project, db_session):
    set_bearer(pat_for_user.token)
    await _make_ready(db_session, seed_project.id, metrics=_METRICS, issues=_ISSUES)
    out = await tools.get_codebase_evidence(
            project=seed_project.id, evidence_ids=["sec:py.sql-injection:a.py:3", "bogus-id"]
        )
    assert any(e["kind"] == "risk" and e["location"] == "a.py:3" for e in out["found"])
    assert "bogus-id" in out["not_found"]


async def test_unauthorized_bearer_is_rejected(pat_for_user, seed_project):
    set_bearer("not-a-real-token")
    with pytest.raises(ApiError) as exc:
        await tools.get_codebase_overview(project=seed_project.id)
    assert exc.value.status in (401, 403)
