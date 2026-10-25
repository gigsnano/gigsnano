from gigsnano_api.features.foundation.compat import check_compatibility


def test_compat_coherent_stack_ok():
    assert check_compatibility(["react", "next"], "postgres", "normalized") == []


def test_compat_db_architecture_mismatch():
    out = check_compatibility(["react"], "postgres", "graph")
    assert out and "does not fit" in out[0]


def test_compat_mutually_exclusive_frameworks():
    out = check_compatibility(["next", "vite"], None, None)
    assert out and "mutually exclusive" in out[0]


def test_compat_unknown_db_is_skipped():
    assert check_compatibility(["react"], "weirddb", "whatever") == []


def test_compat_no_architecture_no_check():
    assert check_compatibility(["react"], "postgres", None) == []
