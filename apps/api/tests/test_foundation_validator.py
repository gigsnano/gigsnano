from gigsnano_api.features.foundation import rules
from gigsnano_api.features.foundation.compiler import compile_foundation
from gigsnano_api.features.foundation.types import ChangedLine, Foundation
from gigsnano_api.features.foundation.validator import validate

FOUNDATION = Foundation(
    allowed_libraries=("react", "next"),
    enforce_design_tokens=True,
    quality_gates=("react-doctor",),
)


def _lines(*pairs: tuple[str, str]) -> list[ChangedLine]:
    return [ChangedLine(file=f, line=i + 1, text=t) for i, (f, t) in enumerate(pairs)]


def test_compliant_diff_passes():
    rs = compile_foundation(FOUNDATION)
    lines = _lines(("Ok.tsx", "import { useState } from 'react'"))
    result = validate(lines, rs, gate_results={"react-doctor": True})
    assert result.status == "pass"
    assert result.violations == ()


def test_hardcoded_color_and_bad_lib_fail_with_anchors():
    rs = compile_foundation(FOUNDATION)
    lines = _lines(
        ("Button.tsx", "const c = '#ff0000'"),
        ("Dep.tsx", "import moment from 'moment'"),
    )
    result = validate(lines, rs, gate_results={"react-doctor": True})
    assert result.status == "fail"
    found = {(v.rule, v.file) for v in result.violations}
    assert (rules.RULE_HARDCODED_COLOR, "Button.tsx") in found
    assert (rules.RULE_UNAPPROVED_LIB, "Dep.tsx") in found


def test_failing_gate_alone_fails():
    rs = compile_foundation(FOUNDATION)
    result = validate(_lines(), rs, gate_results={"react-doctor": False})
    assert result.status == "fail"
    assert result.violations[0].rule == rules.RULE_QUALITY_GATE


def test_disabled_color_rule_is_not_run():
    f = Foundation(allowed_libraries=("react",), enforce_design_tokens=False, quality_gates=())
    rs = compile_foundation(f)
    result = validate(_lines(("a.tsx", "color: #fff")), rs)
    assert result.status == "pass"
