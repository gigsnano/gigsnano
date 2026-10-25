"""Pure bundle-config validation (GIN-412) — the backend twin of the frontend
``validateBundleConfig``. No I/O; operates on plain dicts so it validates both a
draft (unsaved) and a persisted version identically.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

_TRAVERSAL = re.compile(r"(^|/)\.\.(/|$)")
_DRIVE = re.compile(r"^[a-z]:", re.IGNORECASE)
_ORDERED_DEP_TYPES = ("build_order", "blocking")


def normalize_mount_path(path: str) -> str:
    """Lower-case, back-slashes -> slashes, collapsed inner slashes, no edge slashes."""
    p = path.strip().replace("\\", "/")
    p = re.sub(r"/+", "/", p).strip("/")
    return p.lower()


def _is_traversal(path: str) -> bool:
    p = path.strip()
    return bool(_TRAVERSAL.search(p)) or p.startswith("/") or bool(_DRIVE.match(p))


def _issue(code: str, message: str, repo_ids: list[str]) -> dict:
    return {"code": code, "message": message, "repo_ids": repo_ids}


def _rid(row: Mapping, key: str = "project_repository_id") -> str:
    return str(row.get(key) or "")


def _duplicate_repo_issues(repositories: Sequence[Mapping]) -> list[dict]:
    issues: list[dict] = []
    seen: set[str] = set()
    for repo in repositories:
        rid = _rid(repo)
        if rid in seen:
            issues.append(_issue("duplicate_repo", "Repository is selected more than once.", [rid]))
        seen.add(rid)
    return issues


def _mount_path_issues(repositories: Sequence[Mapping]) -> list[dict]:
    issues: list[dict] = []
    mounts: list[tuple[str, str]] = []
    for repo in repositories:
        mount = str(repo.get("mount_path") or "")
        if not mount.strip():
            continue
        if _is_traversal(mount):
            issues.append(
                _issue("path_traversal", f'Mount path "{mount}" is not allowed.', [_rid(repo)])
            )
            continue
        mounts.append((_rid(repo), normalize_mount_path(mount)))

    for i in range(len(mounts)):
        for j in range(i + 1, len(mounts)):
            (id_a, path_a), (id_b, path_b) = mounts[i], mounts[j]
            if path_a == path_b:
                issues.append(
                    _issue(
                        "duplicate_mount_path",
                        f'Mount path "{path_a}" is used by two repositories.',
                        [id_a, id_b],
                    )
                )
            elif path_a.startswith(path_b + "/") or path_b.startswith(path_a + "/"):
                issues.append(
                    _issue(
                        "nested_mount_path",
                        f'Mount paths "{path_a}" and "{path_b}" are nested.',
                        [id_a, id_b],
                    )
                )
    return issues


def _dependency_issues(dependencies: Sequence[Mapping]) -> list[dict]:
    issues: list[dict] = []
    for dep in dependencies:
        if _rid(dep, "from_project_repository_id") == _rid(dep, "to_project_repository_id"):
            issues.append(
                _issue(
                    "self_dependency",
                    "A repository cannot depend on itself.",
                    [_rid(dep, "from_project_repository_id")],
                )
            )
    ordered = [
        dep
        for dep in dependencies
        if _rid(dep, "from_project_repository_id") != _rid(dep, "to_project_repository_id")
        and dep.get("dependency_type") in _ORDERED_DEP_TYPES
    ]
    if _has_cycle(ordered):
        issues.append(_issue("dependency_cycle", "Build-order dependencies form a cycle.", []))
    return issues


def validate_bundle_config(
    repositories: Sequence[Mapping], dependencies: Sequence[Mapping]
) -> dict:
    """Return ``{"valid": bool, "issues": [{"code","message","repo_ids"}]}``.

    Mirrors the spec's validation list: duplicate repos, duplicate/nested mount
    paths, path traversal, self-dependency, and build-order dependency cycles.
    """
    issues = (
        _duplicate_repo_issues(repositories)
        + _mount_path_issues(repositories)
        + _dependency_issues(dependencies)
    )
    return {"valid": len(issues) == 0, "issues": issues}


def _has_cycle(edges: Sequence[Mapping]) -> bool:
    """Kahn's algorithm: fails to visit every node iff a cycle exists."""
    adj: dict[str, list[str]] = {}
    indeg: dict[str, int] = {}
    nodes: set[str] = set()
    for edge in edges:
        src = _rid(edge, "from_project_repository_id")
        dst = _rid(edge, "to_project_repository_id")
        nodes.update((src, dst))
        adj.setdefault(src, []).append(dst)
        indeg[dst] = indeg.get(dst, 0) + 1
    for node in nodes:
        indeg.setdefault(node, 0)

    queue = [n for n in nodes if indeg[n] == 0]
    visited = 0
    while queue:
        node = queue.pop()
        visited += 1
        for nxt in adj.get(node, []):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
    return visited != len(nodes)
