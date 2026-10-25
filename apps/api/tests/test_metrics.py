import json
import subprocess
from pathlib import Path

from gigsnano_api.models import ECloneStatus, EIndexStatus, Project
from gigsnano_api.workspace import metrics as metrics_mod
from gigsnano_api.workspace.metrics import (
    _fake_build,
    _jscpd_duplication,
    _semgrep_issues,
    build_metrics,
    compute_hotspots,
    empty_metrics,
    summarize_semgrep,
)
from gigsnano_api.models import ECodeArtifactKind

from tests.helpers import seed_code_artifact

CREATE = {
    "name": "Mobile Banking App",
    "identifier": "MBA",
    "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}

_SAMPLE_METRICS = {
    "totals": {"files": 1, "loc": 2},
    "languages": [{"name": "Python", "loc": 2}],
    "complexity": {"buckets": [], "worst": []},
    "duplication": {"percent": 0.0},
    "hotspots": [],
    "dependencies": {"cycles": []},
}


async def _setup_ws(client):
    await client.post(
        "/api/auth/sign-up/",
        json={
            "display_name": "Ada Lovelace",
            "email": "ada@example.test",
            "password": "s3cret!",
        },
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def _make_ready_project(client, db_session, identifier="MBA"):
    payload = {**CREATE, "identifier": identifier}
    project = (await client.post("/api/workspaces/acme/projects/", json=payload)).json()
    p = await db_session.get(Project, project["id"])
    p.clone_status = ECloneStatus.READY
    p.index_status = EIndexStatus.READY
    await db_session.commit()
    await seed_code_artifact(db_session, p.id, ECodeArtifactKind.METRICS, _SAMPLE_METRICS)
    return project


async def test_code_metrics_endpoint_returns_metrics_for_ready_project(client, db_session):
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session)

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/metrics/")

    assert res.status_code == 200
    body = res.json()
    assert body["totals"]["files"] == 1
    assert body["languages"][0]["name"] == "Python"


async def test_code_metrics_endpoint_409s_when_index_not_ready(client):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    assert project["index_status"] == "none"

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/metrics/")

    assert res.status_code == 409


async def test_code_metrics_endpoint_404s_cross_workspace(client, db_session):
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session)
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})

    res = await client.get(f"/api/workspaces/other/projects/{project['id']}/code/metrics/")

    assert res.status_code == 404


async def test_code_issues_endpoint_returns_the_scan(client, db_session):
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session, identifier="ISS")
    await seed_code_artifact(
        db_session,
        project["id"],
        ECodeArtifactKind.ISSUES,
        {"issues": [{"rule": "r", "file": "a.py", "line": 1}], "truncated": False},
    )

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/issues/")

    assert res.status_code == 200
    body = res.json()
    assert body["scanned"] is True
    assert body["issues"][0]["file"] == "a.py"


async def test_code_issues_endpoint_reports_not_scanned_when_artifact_absent(client, db_session):
    """No issues.json means semgrep never ran -- which must NOT look identical to a
    clean repo."""
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session, identifier="NOS")

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/issues/")

    assert res.status_code == 200
    assert res.json() == {"issues": [], "truncated": False, "scanned": False}


async def test_code_issues_endpoint_409s_when_index_not_ready(client):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/issues/")

    assert res.status_code == 409


async def test_code_issues_endpoint_404s_cross_workspace(client, db_session):
    """Project-scoped access isn't a single choke point -- every new project-touching
    endpoint has to carry the deps or it leaks."""
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session, identifier="XWS")
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})

    res = await client.get(f"/api/workspaces/other/projects/{project['id']}/code/issues/")

    assert res.status_code == 404


def test_hotspot_ranks_complex_and_churned_first():
    complexity = {"a.py": 10, "b.py": 2, "c.py": 8}
    churn = {"a.py": 20, "b.py": 1, "c.py": 3}
    top = compute_hotspots(complexity, churn)
    assert top[0]["file"] == "a.py"
    assert 0.0 <= top[0]["hotspot"] <= 1.0


def test_hotspot_empty_when_no_history():
    assert compute_hotspots({"a.py": 5}, {}) == []


def test_build_metrics_writes_summary(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("def f():\n    return 1\n")
    out = tmp_path / "out"
    out.mkdir()
    build_metrics(repo, out)  # keyless fake
    m = json.loads((out / "metrics.json").read_text())
    assert "totals" in m and "languages" in m and "hotspots" in m


class _Completed:
    """jscpd puts only a human-readable summary on stdout -- never the JSON."""

    returncode = 0
    stdout = b"Found 63 exact clones with 563(1.70%) duplicated lines"


def _fake_jscpd(report_body: str | None):
    """Stand in for the jscpd binary: write `jscpd-report.json` into whatever
    directory the caller passed via --output, exactly as the real reporter does.
    `report_body=None` fakes a run that produced no report at all."""

    def run(cmd, **_kwargs):
        if report_body is not None:
            out_dir = Path(cmd[cmd.index("--output") + 1])
            (out_dir / "jscpd-report.json").write_text(report_body, encoding="utf-8")
        return _Completed()

    return run


def test_jscpd_duplication_is_none_when_binary_missing(tmp_path, monkeypatch):
    """A missing jscpd must read as 'not measured', never as 0% duplication --
    the two are indistinguishable to a user and 0% is a lie."""

    def boom(*_args, **_kwargs):
        raise FileNotFoundError("jscpd")

    monkeypatch.setattr(subprocess, "run", boom)
    assert _jscpd_duplication(tmp_path) is None


def test_jscpd_duplication_reads_the_report_file_not_stdout(tmp_path, monkeypatch):
    """Regression: the json reporter writes to --output/jscpd-report.json and puts
    only a summary line on stdout, so parsing stdout always yielded 'unmeasured'
    even with jscpd installed."""
    body = json.dumps({"statistics": {"total": {"percentage": 4.2}}})
    monkeypatch.setattr(subprocess, "run", _fake_jscpd(body))
    assert _jscpd_duplication(tmp_path) == 4.2


def test_jscpd_duplication_is_none_on_malformed_report(tmp_path, monkeypatch):
    monkeypatch.setattr(subprocess, "run", _fake_jscpd("not json at all"))
    assert _jscpd_duplication(tmp_path) is None


def test_jscpd_duplication_is_none_when_no_report_written(tmp_path, monkeypatch):
    """jscpd exited but produced nothing -- unmeasured, not 0%."""
    monkeypatch.setattr(subprocess, "run", _fake_jscpd(None))
    assert _jscpd_duplication(tmp_path) is None


def test_jscpd_duplication_zero_is_a_real_measurement(tmp_path, monkeypatch):
    """A genuine 0% must survive as 0.0 and never collapse into None -- that
    distinction is the whole point of the nullable type."""
    body = json.dumps({"statistics": {"total": {"percentage": 0}}})
    monkeypatch.setattr(subprocess, "run", _fake_jscpd(body))
    assert _jscpd_duplication(tmp_path) == 0.0


def test_fake_build_reports_duplication_unmeasured(tmp_path):
    """The keyless fake never runs jscpd, so it must not claim 0% duplication.
    Calls _fake_build directly rather than via build_metrics, which would branch on
    settings.code_index_enabled and make this assert depend on the dev's .env."""
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("def f():\n    return 1\n")
    summary = _fake_build(repo)
    assert summary["duplication"]["percent"] is None
    assert summary["totals"]["files"] == 1


def test_build_metrics_never_raises_and_writes_empty_shape(tmp_path, monkeypatch):
    """The catastrophic fallback must still produce a readable, complete shape --
    build_metrics runs in asyncio.to_thread from a job that must not crash. Both
    branches are patched so the test doesn't depend on settings.code_index_enabled."""

    def boom(*_args, **_kwargs):
        raise RuntimeError("analyzer exploded")

    monkeypatch.setattr(metrics_mod, "_fake_build", boom)
    monkeypatch.setattr(metrics_mod, "_real_build", boom)
    out = tmp_path / "out"
    out.mkdir()
    build_metrics(tmp_path / "nope", out)  # must not raise
    m = json.loads((out / "metrics.json").read_text())
    assert m == empty_metrics()


def test_empty_metrics_has_every_section():
    """empty_metrics() is the single source of the shape (it backs the fallback in
    build_metrics AND the missing-file branch of the code/metrics endpoint), so a
    new section can't be added to one copy and forgotten in the other."""
    assert set(empty_metrics()) == {
        "totals",
        "languages",
        "languages_source",
        "complexity",
        "duplication",
        "hotspots",
        "dependencies",
        "issues",
    }
    assert empty_metrics()["duplication"]["percent"] is None
    assert empty_metrics()["issues"] is None
    # Nothing was scanned, so claim no scanner (GIN-135).
    assert empty_metrics()["languages_source"] is None


def _finding(rule="python.lang.security.audit.exec-detected", severity="ERROR", path="src/a.py", line=42, cwe=None):
    """One entry as it appears in `semgrep --json`'s `results` array."""
    extra: dict = {"severity": severity, "message": "Detected exec usage."}
    if cwe is not None:
        extra["metadata"] = {"cwe": cwe}
    return {"check_id": rule, "path": path, "start": {"line": line}, "extra": extra}


def test_summarize_semgrep_counts_by_severity():
    summary, _full = summarize_semgrep(
        [
            _finding(severity="ERROR"),
            _finding(severity="ERROR"),
            _finding(severity="WARNING"),
            _finding(severity="INFO"),
        ]
    )
    assert summary["counts"] == {"error": 2, "warning": 1, "info": 1}


def test_summarize_semgrep_empty_is_a_clean_scan_not_an_absent_one():
    """No findings means "scanned, clean" -- all-zero counts. The *absent* case is
    represented by issues=None from _semgrep_issues, never by this."""
    summary, full = summarize_semgrep([])
    assert summary["counts"] == {"error": 0, "warning": 0, "info": 0}
    assert summary["by_rule"] == [] and summary["top"] == []
    assert full == {"issues": [], "truncated": False}


def test_summarize_semgrep_by_rule_is_ranked_and_capped_at_20():
    results = []
    for i in range(25):
        results.extend([_finding(rule=f"rule-{i}")] * (i + 1))  # rule-24 most frequent
    summary, _full = summarize_semgrep(results)
    assert len(summary["by_rule"]) == 20
    assert summary["by_rule"][0] == {"rule": "rule-24", "severity": "ERROR", "count": 25}
    assert summary["by_rule"][0]["count"] >= summary["by_rule"][-1]["count"]


def test_summarize_semgrep_top_is_capped_at_20_and_errors_first():
    results = [_finding(severity="INFO", line=i) for i in range(30)]
    results.append(_finding(severity="ERROR", line=999))
    summary, _full = summarize_semgrep(results)
    assert len(summary["top"]) == 20
    assert summary["top"][0]["severity"] == "ERROR", "most severe must survive the cap"


def test_summarize_semgrep_full_list_is_capped_and_flags_truncation():
    _summary, full = summarize_semgrep([_finding(line=i) for i in range(5_100)])
    assert len(full["issues"]) == 5_000
    assert full["truncated"] is True


def test_semgrep_runs_from_the_repo_so_paths_come_back_relative(tmp_path, monkeypatch):
    """Regression: an absolute target makes semgrep emit absolute paths, which won't
    join with hotspots/graph (repo-relative) or anything keyed on file:line."""
    seen: dict = {}

    def run(cmd, **kwargs):
        seen["target"] = cmd[-1]
        seen["cwd"] = kwargs.get("cwd")

        class _C:
            returncode = 0
            stdout = json.dumps({"results": []}).encode()

        return _C()

    monkeypatch.setattr(subprocess, "run", run)
    _semgrep_issues(tmp_path)
    assert seen["target"] == ".", "must scan '.', not an absolute path"
    assert seen["cwd"] == str(tmp_path)


def test_semgrep_issues_is_none_when_binary_missing(tmp_path, monkeypatch):
    """Native-Windows dev has no semgrep -- 'not scanned', never a clean result."""

    def boom(*_args, **_kwargs):
        raise FileNotFoundError("semgrep")

    monkeypatch.setattr(subprocess, "run", boom)
    assert _semgrep_issues(tmp_path) is None


def test_semgrep_issues_is_none_on_unparseable_output(tmp_path, monkeypatch):
    class _C:
        returncode = 2
        stdout = b"rule fetch failed"

    monkeypatch.setattr(subprocess, "run", lambda *_a, **_k: _C())
    assert _semgrep_issues(tmp_path) is None


def test_semgrep_issues_ignores_return_code_when_stdout_parses(tmp_path, monkeypatch):
    """semgrep signals findings/rule problems through the exit code too, so a
    non-zero exit with valid JSON is still a successful scan."""

    class _C:
        returncode = 1
        stdout = json.dumps({"results": [_finding()]}).encode()

    monkeypatch.setattr(subprocess, "run", lambda *_a, **_k: _C())
    scanned = _semgrep_issues(tmp_path)
    assert scanned is not None
    assert scanned[0]["counts"]["error"] == 1


def test_summarize_semgrep_carries_location_rule_and_cwe():
    _summary, full = summarize_semgrep([_finding(path="src/b.py", line=7, cwe=["CWE-95"])])
    issue = full["issues"][0]
    assert issue["file"] == "src/b.py"
    assert issue["line"] == 7
    assert issue["cwe"] == ["CWE-95"]
    assert issue["rule"] == "python.lang.security.audit.exec-detected"


def test_summarize_semgrep_skips_malformed_findings_without_raising():
    """Semgrep output is an external contract -- one odd entry must not lose the scan."""
    summary, full = summarize_semgrep(
        [
            {},  # nothing at all
            {"check_id": "r", "path": "a.py"},  # no start/extra
            "not even a dict",  # type is wrong
            _finding(),  # the one good row
        ]
    )
    assert summary["counts"]["error"] == 1
    assert len(full["issues"]) == 1


def test_summarize_semgrep_normalizes_unknown_severity_to_info():
    """Semgrep has emitted other severity labels over time; anything we don't know
    must land somewhere countable rather than vanishing from the tally."""
    summary, _full = summarize_semgrep([_finding(severity="EXPERIMENT")])
    assert sum(summary["counts"].values()) == 1


def test_empty_metrics_callers_cannot_poison_each_other():
    """It's a function, not a shared constant -- a caller mutating its result must
    not leak into the next response."""
    first = empty_metrics()
    first["duplication"]["percent"] = 99.0
    assert empty_metrics()["duplication"]["percent"] is None


def test_languages_source_flips_when_scc_is_unavailable(tmp_path, monkeypatch):
    """GIN-135: the fallback is a real but narrower measurement (11 extensions, raw
    lines). It must be labelled, or a degraded scan is indistinguishable from scc."""
    from gigsnano_api.workspace import metrics as metrics_mod

    (tmp_path / "a.py").write_text("x = 1\n")

    monkeypatch.setattr(metrics_mod, "_scc_languages", lambda _d: None)
    assert metrics_mod._real_build(tmp_path)[0]["languages_source"] == "file_scan"

    monkeypatch.setattr(
        metrics_mod,
        "_scc_languages",
        lambda _d: ({"files": 1, "loc": 1}, [{"name": "Python", "loc": 1}]),
    )
    assert metrics_mod._real_build(tmp_path)[0]["languages_source"] == "scc"


def test_fake_build_is_always_file_scan(tmp_path):
    """The keyless dev build never runs scc, so it must not claim to have."""
    from gigsnano_api.workspace import metrics as metrics_mod

    (tmp_path / "a.py").write_text("x = 1\n")
    assert metrics_mod._fake_build(tmp_path)["languages_source"] == "file_scan"
