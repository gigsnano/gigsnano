from . import rules
from .types import ChangedLine, Ruleset, ValidationResult, Violation


def validate(
    lines: list[ChangedLine],
    ruleset: Ruleset,
    gate_results: dict[str, bool] | None = None,
) -> ValidationResult:
    gate_results = gate_results or {}
    blocking_by_key = {r.key: r.blocking for r in ruleset.rules}
    found: list[Violation] = []

    if rules.RULE_HARDCODED_COLOR in blocking_by_key:
        found += rules.find_hardcoded_colors(
            lines, blocking=blocking_by_key[rules.RULE_HARDCODED_COLOR]
        )
    if rules.RULE_UNAPPROVED_LIB in blocking_by_key:
        found += rules.find_unapproved_libraries(
            lines, ruleset.allowed_libraries, blocking=blocking_by_key[rules.RULE_UNAPPROVED_LIB]
        )
    if rules.RULE_QUALITY_GATE in blocking_by_key:
        found += rules.check_quality_gates(
            gate_results, ruleset.quality_gates, blocking=blocking_by_key[rules.RULE_QUALITY_GATE]
        )

    status = "fail" if any(v.blocking for v in found) else "pass"
    return ValidationResult(status=status, violations=tuple(found))
