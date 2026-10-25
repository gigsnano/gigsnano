"""Static code metrics pass for a cloned repo (Repo-Aware Plan 4). Mirrors
workspace/er_extract.py and workspace/graph_view.py in style: pure helpers +
a never-raise `build_metrics` writer, behind the same keyless fake seam as
`build_code_index`.

Real path shells out to `scc` (size/LOC per language) and `jscpd` (duplication)
and imports `lizard` (complexity) -- each guarded independently so a missing
binary degrades only that section, never the whole pass. Churn comes from
`git log --numstat`, and is intentionally omitted (not just empty complexity)
when the repo has no usable history -- e.g. Plan 1's `--depth 1` shallow
clone -- per the MVP churn caveat. Coverage is out of scope for MVP (would be
ingested from committed lcov/Cobertura, never generated) and dependency-cycle
detection is left empty for now -- neither tool in the plan's static stack
produces them and none is wired.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path

from gigsnano_api.core.config import settings

_LANG_BY_EXT = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
}
_COMPLEXITY_BUCKETS = [
    ("1-5", 1, 5),
    ("6-10", 6, 10),
    ("11-20", 11, 20),
    ("21-50", 21, 50),
    ("51+", 51, None),
]
# Issue caps. The summary caps exist because metrics.json is fed to the LLM whole
# (see summarize_semgrep); _ISSUES_CAP is a backstop against a pathological repo
# rather than a product decision -- when it bites, `truncated` says so out loud.
_BY_RULE_CAP = 20
_TOP_CAP = 20
_ISSUES_CAP = 5_000
_SEVERITY_ORDER = {"ERROR": 0, "WARNING": 1, "INFO": 2}
# Semgrep's curated default pack, resolved from its registry (hence the network
# dependency -- a failed fetch degrades to "not scanned", like any other analyzer
# failure here). Vendoring a rule set is the upgrade path if that ever matters.
_SEMGREP_CONFIG = "p/default"
# Written only when a scan actually happened; the endpoint reports `scanned: false`
# when it's missing, so "not scanned" never masquerades as "clean".
ISSUES_FILENAME = "issues.json"


def empty_metrics() -> dict:
    """The canonical empty metrics shape, and the single definition of which
    sections exist. Backs both the never-raise fallback in `build_metrics` and the
    missing-file branch of `GET .../code/metrics/` -- a new section added here
    reaches every consumer, rather than being added to one copy and forgotten in
    the other. A function, not a module constant, so no caller can mutate the
    shared dict and poison later responses.

    `duplication.percent` and `issues` are None, not 0.0/empty: "not measured" and
    "measured, zero" are different facts and the UI must not conflate them."""
    return {
        "totals": {"files": 0, "loc": 0},
        "languages": [],
        "languages_source": None,
        "complexity": {"buckets": [], "worst": []},
        "duplication": {"percent": None},
        "hotspots": [],
        "dependencies": {"cycles": []},
        "issues": None,
    }


def summarize_semgrep(results: list) -> tuple[dict, dict]:
    """Split raw `semgrep --json` results into (capped summary, full payload).

    Two shapes on purpose. The summary rides `metrics.json`, which
    `agent/tools/code.py::_code_metrics` hands to the LLM **in its entirety** -- a
    real repo yields four figures of findings, so an uncapped list there would eat
    the context window. The full payload is a separate artifact behind its own
    endpoint, for the Issues screen.

    Pure and total: semgrep's output is an external contract, so a malformed entry
    is skipped rather than losing the whole scan. An empty `results` is a *clean*
    scan (all-zero counts); "not scanned" is `None` from `_semgrep_issues` and is
    never expressed here."""
    counts = {"error": 0, "warning": 0, "info": 0}
    issues: list[dict] = []
    for row in results:
        if not isinstance(row, dict):
            continue
        try:
            extra = row["extra"]
            # Unknown/new severity labels bucket to info rather than vanishing from
            # the tally -- a finding we can't classify is still a finding.
            severity = str(extra.get("severity", "INFO")).upper()
            key = severity.lower() if severity.lower() in counts else "info"
            issue = {
                "rule": row["check_id"],
                "severity": severity,
                "file": row["path"],
                "line": int(row["start"]["line"]),
                "message": str(extra.get("message", "")).strip(),
                "cwe": list(extra.get("metadata", {}).get("cwe", []) or []),
            }
        except (KeyError, TypeError, ValueError):
            continue
        counts[key] += 1
        issues.append(issue)

    by_rule: dict[str, dict] = {}
    for issue in issues:
        row = by_rule.setdefault(
            issue["rule"], {"rule": issue["rule"], "severity": issue["severity"], "count": 0}
        )
        row["count"] += 1
    ranked_rules = sorted(by_rule.values(), key=lambda r: -r["count"])[:_BY_RULE_CAP]

    ranked_issues = sorted(issues, key=lambda i: (_SEVERITY_ORDER.get(i["severity"], 3), i["file"]))
    summary = {
        "counts": counts,
        "by_rule": ranked_rules,
        "top": ranked_issues[:_TOP_CAP],
    }
    full = {
        "issues": ranked_issues[:_ISSUES_CAP],
        "truncated": len(ranked_issues) > _ISSUES_CAP,
    }
    return summary, full


def _norm(d: dict[str, int]) -> dict[str, float]:
    if not d:
        return {}
    hi = max(d.values()) or 1
    return {k: v / hi for k, v in d.items()}


def compute_hotspots(complexity: dict[str, int], churn: dict[str, int]) -> list[dict]:
    """Join complexity x churn into a ranked hotspot list, top 30. Empty churn
    (no git history, e.g. a shallow clone) means hotspots can't be computed at
    all -- return [] rather than a misleading complexity-only ranking."""
    if not churn:
        return []
    nc, nh = _norm(complexity), _norm(churn)
    files = set(complexity) | set(churn)
    rows = [
        {
            "file": f,
            "complexity": complexity.get(f, 0),
            "churn": churn.get(f, 0),
            "hotspot": round(nc.get(f, 0.0) * nh.get(f, 0.0), 4),
        }
        for f in files
    ]
    rows.sort(key=lambda r: r["hotspot"], reverse=True)
    return rows[:30]


def _file_scan_languages(repo_dir: Path) -> tuple[dict, list[dict]]:
    """Per-language LOC via a light line-count file scan (no external tool).
    Used as the keyless fake, and as a fallback when `scc` is unavailable."""
    lang_loc: dict[str, int] = defaultdict(int)
    files = 0
    for p in sorted(repo_dir.rglob("*")):
        if p.is_symlink() or not p.is_file():
            continue
        lang = _LANG_BY_EXT.get(p.suffix)
        if lang is None:
            continue
        files += 1
        try:
            loc = sum(1 for _ in p.open(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        lang_loc[lang] += loc
    languages = [{"name": k, "loc": v} for k, v in sorted(lang_loc.items(), key=lambda kv: -kv[1])]
    totals = {"files": files, "loc": sum(lang_loc.values())}
    return totals, languages


def _scc_languages(repo_dir: Path) -> tuple[dict, list[dict]] | None:
    """`scc --format json` -> (totals, languages). None on any failure (missing
    binary, bad output, timeout) so the caller can fall back to a file scan."""
    try:
        completed = subprocess.run(
            ["scc", "--format", "json", str(repo_dir)],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            return None
        rows = json.loads(completed.stdout.decode("utf-8", "replace"))
        languages = [
            {"name": row["Name"], "loc": row["Code"]}
            for row in rows
            if "Name" in row and "Code" in row
        ]
        languages.sort(key=lambda r: -r["loc"])
        files = sum(row.get("Count", 0) for row in rows)
        totals = {"files": files, "loc": sum(r["loc"] for r in languages)}
        return totals, languages
    except Exception:  # noqa: BLE001 - missing/broken tool degrades to fallback
        return None


def _lizard_complexity(repo_dir: Path) -> tuple[dict[str, int], list[dict], list[dict]]:
    """(per-file max CCN, worst functions, CCN histogram buckets) via `lizard`.
    Empty on any failure -- a missing/unimportable lizard degrades this section
    only."""
    try:
        import lizard
    except Exception:  # noqa: BLE001
        return {}, [], []
    try:
        file_infos = list(lizard.analyze([str(repo_dir)]))
    except Exception:  # noqa: BLE001 - malformed source must not fail the pass
        return {}, [], []
    per_file: dict[str, int] = {}
    all_functions: list[dict] = []
    for info in file_infos:
        try:
            rel = Path(info.filename).relative_to(repo_dir).as_posix()
        except ValueError:
            rel = info.filename
        worst_in_file = 0
        for fn in info.function_list:
            ccn = int(fn.cyclomatic_complexity)
            worst_in_file = max(worst_in_file, ccn)
            all_functions.append({"name": fn.name, "file": rel, "ccn": ccn})
        if worst_in_file:
            per_file[rel] = worst_in_file
    all_functions.sort(key=lambda f: -f["ccn"])
    worst = all_functions[:20]
    buckets = []
    for label, lo, hi in _COMPLEXITY_BUCKETS:
        count = sum(1 for f in all_functions if f["ccn"] >= lo and (hi is None or f["ccn"] <= hi))
        buckets.append({"range": label, "count": count})
    return per_file, worst, buckets


def _jscpd_duplication(repo_dir: Path) -> float | None:
    """Duplication percent via jscpd. **None** on any failure (binary absent, bad
    JSON, timeout) -- meaning "not measured", which the UI renders differently from
    a real 0%. Degrades this section only; never fails the pass.

    jscpd's json reporter writes `jscpd-report.json` into its `--output` directory
    and puts only a human-readable summary on stdout, so the report is read from
    disk. `--output` also keeps jscpd from littering a `report/` folder into the
    process CWD, which is what it does by default.

    Indexes the payload directly rather than `.get(..., 0.0)`: a report missing the
    statistics block means jscpd told us nothing, and calling that 0% duplication
    would be a fabricated measurement."""
    try:
        with tempfile.TemporaryDirectory() as report_dir:
            subprocess.run(
                ["jscpd", str(repo_dir), "--reporters", "json", "--output", report_dir, "--silent"],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                timeout=120,
                check=False,
            )
            report = Path(report_dir) / "jscpd-report.json"
            data = json.loads(report.read_text(encoding="utf-8"))
        return float(data["statistics"]["total"]["percentage"])
    except Exception:  # noqa: BLE001 - missing/broken tool degrades to "not measured"
        return None


def _semgrep_issues(repo_dir: Path) -> tuple[dict, dict] | None:
    """Rule violations via `semgrep scan --json`. **None** on any failure (binary
    absent -- e.g. native-Windows dev, no network for the rule pack, bad JSON,
    timeout) meaning "not scanned", which the UI must render differently from a
    clean scan. Degrades this section only; never fails the pass.

    Returns `(summary, full)` -- see `summarize_semgrep` for why there are two.

    Runs with `cwd=repo_dir` against `.` so semgrep emits **repo-relative** paths.
    Passing an absolute target makes it report absolute ones, which wouldn't join
    up with hotspots/graph (both repo-relative, cf. `_lizard_complexity`) or with
    anything keyed on `file:line`.

    The return code is deliberately ignored: semgrep uses it to signal findings and
    rule-load problems as well as hard failures, so stdout is the honest signal --
    if it parses, we scanned."""
    try:
        completed = subprocess.run(
            [
                "semgrep",
                "scan",
                "--json",
                "--metrics=off",
                "--quiet",
                "--config",
                _SEMGREP_CONFIG,
                ".",
            ],
            cwd=str(repo_dir),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=600,
            check=False,
        )
        data = json.loads(completed.stdout.decode("utf-8", "replace"))
        return summarize_semgrep(data["results"])
    except Exception:  # noqa: BLE001 - missing/broken tool degrades to "not scanned"
        return None


def _has_git_history(repo_dir: Path) -> bool:
    """False for a shallow (`--depth 1`) clone or any repo with <2 commits --
    the MVP churn caveat: churn/hotspots are omitted rather than computed from
    a single-commit snapshot."""
    try:
        completed = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=str(repo_dir),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if completed.returncode != 0:
            return False
        return int(completed.stdout.decode("utf-8", "replace").strip()) > 1
    except Exception:  # noqa: BLE001
        return False


def _git_churn(repo_dir: Path) -> dict[str, int]:
    """file -> commit count touching it, via `git log --numstat`. {} when there's
    no usable history (see `_has_git_history`) or on any tool failure."""
    if not _has_git_history(repo_dir):
        return {}
    try:
        completed = subprocess.run(
            ["git", "log", "--numstat", "--pretty=format:"],
            cwd=str(repo_dir),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            return {}
    except Exception:  # noqa: BLE001
        return {}
    churn: dict[str, int] = defaultdict(int)
    for line in completed.stdout.decode("utf-8", "replace").splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        added, removed, path = parts
        if added == "-" or removed == "-":
            continue  # binary file, no numstat
        churn[path] += 1
    return dict(churn)


def _fake_build(repo_dir: Path) -> dict:
    # The fake never runs jscpd or semgrep, so duplication stays "not measured"
    # (None) rather than claiming 0%, and issues stay "not scanned".
    summary = empty_metrics()
    summary["totals"], summary["languages"] = _file_scan_languages(repo_dir)
    summary["languages_source"] = "file_scan"
    return summary


def _real_build(repo_dir: Path) -> tuple[dict, dict | None]:
    """(metrics summary, full issues payload). The issues payload is None when the
    scan didn't happen, and is written as its own artifact -- it must not ride
    metrics.json, which is fed to the LLM whole."""
    # Which scanner produced the language/LOC numbers. The fallback is a real but
    # materially narrower measurement -- 11 extensions, raw lines instead of scc's
    # code lines -- so it must not present as a healthy scan (GIN-135). Unlike
    # duplication (GIN-131), it isn't None-able: it's incomplete, not absent, so we
    # label the source rather than withhold the number.
    scc_result = _scc_languages(repo_dir)
    totals, languages = scc_result if scc_result is not None else _file_scan_languages(repo_dir)
    complexity_map, worst, buckets = _lizard_complexity(repo_dir)
    churn_map = _git_churn(repo_dir)
    scanned = _semgrep_issues(repo_dir)
    summary = empty_metrics()
    summary["totals"] = totals
    summary["languages"] = languages
    summary["languages_source"] = "scc" if scc_result is not None else "file_scan"
    summary["complexity"] = {"buckets": buckets, "worst": worst}
    summary["duplication"] = {"percent": _jscpd_duplication(repo_dir)}
    summary["hotspots"] = compute_hotspots(complexity_map, churn_map)
    summary["issues"] = scanned[0] if scanned is not None else None
    return summary, (scanned[1] if scanned is not None else None)


def build_metrics(repo_dir: Path, out_dir: Path) -> None:
    """Static metrics pass -> metrics.json (+ issues.json when a scan ran) in
    out_dir. Real static-tool pipeline when code_index_enabled, else a
    deterministic keyless file-scan fake (mirrors build_code_index /
    build_er_schema). Never raises -- this runs inside asyncio.to_thread from a
    background job that must not crash on tool failures."""
    try:
        if settings.code_index_enabled:
            summary, issues_full = _real_build(repo_dir)
        else:
            summary, issues_full = _fake_build(repo_dir), None
    except Exception:  # noqa: BLE001 - never raise out of the index job
        # Static empty shape rather than re-running _fake_build (whose rglob could
        # itself raise a traversal error) -- this fallback must not raise either.
        summary, issues_full = empty_metrics(), None
    (out_dir / "metrics.json").write_text(json.dumps(summary), encoding="utf-8")
    # Only write the artifact when a scan produced one. Its absence is what the
    # endpoint reports as `scanned: false` -- writing an empty list here would make
    # "semgrep never ran" indistinguishable from "the repo is clean".
    if issues_full is not None:
        (out_dir / ISSUES_FILENAME).write_text(json.dumps(issues_full), encoding="utf-8")
