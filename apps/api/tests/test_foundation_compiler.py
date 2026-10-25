from gigsnano_api.features.foundation import rules
from gigsnano_api.features.foundation.compiler import compile_foundation
from gigsnano_api.features.foundation.types import Foundation


def test_compiles_all_rules_when_tokens_enforced():
    f = Foundation(
        allowed_libraries=("react", "next"),
        enforce_design_tokens=True,
        quality_gates=("react-doctor",),
    )
    rs = compile_foundation(f)
    keys = {r.key for r in rs.rules}
    assert keys == {
        rules.RULE_HARDCODED_COLOR,
        rules.RULE_UNAPPROVED_LIB,
        rules.RULE_QUALITY_GATE,
    }
    assert rs.allowed_libraries == frozenset({"react", "next"})
    assert rs.quality_gates == ("react-doctor",)
    assert all(r.blocking for r in rs.rules)


def test_omits_color_rule_when_tokens_not_enforced():
    f = Foundation(allowed_libraries=(), enforce_design_tokens=False, quality_gates=())
    rs = compile_foundation(f)
    keys = {r.key for r in rs.rules}
    assert keys == {rules.RULE_UNAPPROVED_LIB}
