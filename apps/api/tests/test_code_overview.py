"""Codebase Overview aggregation + honest scoring (GIN-272).

Pure `assemble_overview`/health tests cover the state branches (indexing / empty /
partial / unavailable / stale); the endpoint tests cover the one behaviour that
distinguishes this route from every other code endpoint — it returns 200 in every
index state instead of 409ing pre-index.
"""

from gigsnano_api.models import ECloneStatus, ECodeArtifactKind, EIndexStatus, Project
from gigsnano_api.workspace.overview import (
    assemble_overview,
    health_from_metrics,
    modules_from_graph,
    risks_from,
)

from tests.helpers import seed_code_artifact

CREATE = {
    "name": "Mobile Banking App",
    "identifier": "MBA",
    "flow": "existing",
    "cover_image_url": "https://img.test/c.jpg",
}

_GRAPH = {
    "nodes": [
        {"id": "src/auth/login.py:login", "source_file": "src/auth/login.py", "kind": "function"},
        {"id": "src/auth/login.py", "source_file": "src/auth/login.py", "kind": "file"},
        {"id": "src/billing/charge.py:charge", "source_file": "src/billing/charge.py", "kind": "function"},
    ],
    # a mutual dependency: auth <-> billing == one circular module group
    "edges": [
        {"source": "src/auth/login.py:login", "target": "src/billing/charge.py:charge"},
        {"source": "src/billing/charge.py:charge", "target": "src/auth/login.py:login"},
    ],
}

_METRICS = {
    "totals": {"files": 2, "loc": 120},
    "languages": [{"name": "Python", "loc": 120}],
    "languages_source": "scc",
    "complexity": {"buckets": [], "worst": [{"name": "charge", "file": "src/billing/charge.py", "ccn": 30}]},
    "duplication": {"percent": 4.0},
    "hotspots": [{"file": "src/billing/charge.py", "complexity": 30, "churn": 10, "hotspot": 0.7}],
    "dependencies": {"cycles": []},
    "issues": {"counts": {"error": 1, "warning": 2, "info": 0}, "by_rule": [], "top": []},
}


# ---- pure service ----------------------------------------------------------

def test_health_security_unavailable_when_not_scanned():
    """metrics.issues is None => semgrep didn't run => security is unavailable,
    never a passing/healthy label."""
    h = health_from_metrics({**_METRICS, "issues": None}, _GRAPH)
    sec = next(d for d in h["dimensions"] if d["key"] == "security")
    assert sec["status"] == "unavailable"
    assert sec["score"] is None


def test_health_coverage_always_unavailable_not_passing():
    h = health_from_metrics(_METRICS, _GRAPH)
    cov = next(d for d in h["dimensions"] if d["key"] == "test_coverage")
    assert cov["status"] == "unavailable"  # no coverage data ever reads as passing


def test_health_architecture_unavailable_without_edges():
    h = health_from_metrics(_METRICS, {"nodes": _GRAPH["nodes"], "edges": []})
    arch = next(d for d in h["dimensions"] if d["key"] == "architecture")
    assert arch["status"] == "unavailable"


def test_health_architecture_flags_circular_modules():
    h = health_from_metrics(_METRICS, _GRAPH)
    arch = next(d for d in h["dimensions"] if d["key"] == "architecture")
    assert arch["status"] != "unavailable"
    assert "circular" in arch["evidence"].lower()


def test_health_overall_score_needs_two_dimensions():
    # only security measurable (no graph edges, no complexity/dup) => <2 dims => None
    thin = {"complexity": {"buckets": [], "worst": []}, "duplication": {"percent": None}, "issues": None}
    h = health_from_metrics(thin, {"nodes": [], "edges": []})
    assert h["score"] is None
    assert h["measured_dimensions"] < 2


def test_modules_group_under_src_and_count():
    mods = modules_from_graph(_GRAPH)
    keys = {m["key"] for m in mods}
    assert "src/auth" in keys and "src/billing" in keys
    auth = next(m for m in mods if m["key"] == "src/auth")
    assert auth["symbols"] == 2 and auth["files"] == 1


def test_risks_rank_security_and_hotspots():
    risks = risks_from(_METRICS, {"issues": [
        {"rule": "python.lang.security.audit.x", "severity": "ERROR", "file": "a.py", "line": 3, "message": "bad"},
    ]}, None)
    assert risks[0]["severity"] == "critical"  # semgrep ERROR ranks first
    assert any(r["category"] == "hotspot" for r in risks)


def test_assemble_indexing_state_when_pending_and_no_data():
    ov = assemble_overview(
        status=EIndexStatus.PENDING, index_error=None, repo_full_name="o/r", branch="main",
        indexed_sha=None, indexed_at=None, graph=None, metrics=None, issues=None, changes=None,
    )
    assert ov["state"] == "indexing"
    assert ov["counts"]["state"] == "indexing"
    assert ov["health"]["dimensions"]  # dimensions still described, all unavailable


def test_assemble_empty_state_when_ready_but_no_nodes():
    ov = assemble_overview(
        status=EIndexStatus.READY, index_error=None, repo_full_name="o/r", branch="main",
        indexed_sha="abc", indexed_at=None, graph={"nodes": [], "edges": []},
        metrics=None, issues=None, changes=None,
    )
    assert ov["state"] == "empty"


def test_assemble_stale_when_head_drifted():
    ov = assemble_overview(
        status=EIndexStatus.READY, index_error=None, repo_full_name="o/r", branch="main",
        indexed_sha="aaa", indexed_at=None, head_sha="bbb",
        graph=_GRAPH, metrics=_METRICS, issues=None, changes=None,
    )
    assert ov["state"] == "stale"
    assert ov["index"]["drifted"] is True
    assert ov["counts"]["state"] == "stale"


def test_assemble_ready_aggregates_all_sections():
    ov = assemble_overview(
        status=EIndexStatus.READY, index_error=None, repo_full_name="o/r", branch="main",
        indexed_sha="aaa", indexed_at=None, graph=_GRAPH, metrics=_METRICS, issues=None,
        changes={"commits": [{"sha": "aaa", "author": "A", "message": "init", "committed_at": None}]},
    )
    assert ov["state"] == "ready"
    assert ov["counts"]["symbols"] == 3 and ov["counts"]["files"] == 2
    assert ov["modules"]["items"]
    assert ov["changes"]["items"][0]["is_indexed_head"] is True


# ---- endpoint --------------------------------------------------------------

async def _setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_overview_endpoint_200_when_not_indexed(client):
    """The differentiator: overview never 409s — a brand-new project returns a
    usable 'none' surface, not an error."""
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/overview/")
    assert res.status_code == 200
    body = res.json()
    assert body["state"] == "none"
    assert body["index"]["status"] == "none"


async def test_overview_endpoint_aggregates_ready_project(client, db_session):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    p = await db_session.get(Project, project["id"])
    p.clone_status = ECloneStatus.READY
    p.index_status = EIndexStatus.READY
    p.indexed_commit_sha = "deadbeef"
    await db_session.commit()
    await seed_code_artifact(db_session, p.id, ECodeArtifactKind.GRAPH, _GRAPH)
    await seed_code_artifact(db_session, p.id, ECodeArtifactKind.METRICS, _METRICS)

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/overview/")

    assert res.status_code == 200
    body = res.json()
    assert body["state"] == "ready"
    assert body["counts"]["symbols"] == 3
    sec = next(d for d in body["health"]["dimensions"] if d["key"] == "security")
    assert sec["status"] == "warning"  # 1 error + 2 warnings => 100-20-10 = 70 (warning band)
    assert {m["key"] for m in body["modules"]["items"]} >= {"src/auth", "src/billing"}


async def test_overview_endpoint_404s_cross_workspace(client, db_session):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})
    res = await client.get(f"/api/workspaces/other/projects/{project['id']}/code/overview/")
    assert res.status_code == 404
