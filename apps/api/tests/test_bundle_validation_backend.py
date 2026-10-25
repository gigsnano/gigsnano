"""GIN-412 — pure bundle-config validator (backend twin of the frontend logic)."""

from gigsnano_api.features.system.validation import normalize_mount_path, validate_bundle_config


def _repo(rid, mount, access="write"):
    return {"project_repository_id": rid, "mount_path": mount, "access": access}


def _dep(a, b):
    return {
        "from_project_repository_id": a,
        "to_project_repository_id": b,
        "dependency_type": "build_order",
    }


def test_clean_bundle_is_valid():
    r = validate_bundle_config([_repo("a", "apps/web"), _repo("b", "services/api")], [])
    assert r["valid"] and r["issues"] == []


def test_duplicate_repo():
    r = validate_bundle_config([_repo("a", "apps/web"), _repo("a", "services/api")], [])
    assert any(i["code"] == "duplicate_repo" for i in r["issues"])


def test_duplicate_and_nested_mount_paths():
    dup = validate_bundle_config([_repo("a", "apps/web"), _repo("b", "apps/web/")], [])
    assert any(i["code"] == "duplicate_mount_path" for i in dup["issues"])
    nested = validate_bundle_config([_repo("a", "apps"), _repo("b", "apps/web")], [])
    assert any(i["code"] == "nested_mount_path" for i in nested["issues"])


def test_path_traversal():
    r = validate_bundle_config([_repo("a", "../secrets")], [])
    assert any(i["code"] == "path_traversal" for i in r["issues"])


def test_self_and_cycle_dependencies():
    self_dep = validate_bundle_config([_repo("a", "x")], [_dep("a", "a")])
    assert any(i["code"] == "self_dependency" for i in self_dep["issues"])
    cycle = validate_bundle_config(
        [_repo("a", "x"), _repo("b", "y")], [_dep("a", "b"), _dep("b", "a")]
    )
    assert any(i["code"] == "dependency_cycle" for i in cycle["issues"])
    ok = validate_bundle_config(
        [_repo("a", "x"), _repo("b", "y"), _repo("c", "z")], [_dep("a", "b"), _dep("b", "c")]
    )
    assert ok["valid"]


def test_normalize_mount_path():
    assert normalize_mount_path("/Apps/Web/") == "apps/web"
