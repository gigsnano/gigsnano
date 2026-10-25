from . import rules
from .types import Foundation, Rule, Ruleset


def compile_foundation(foundation: Foundation) -> Ruleset:
    compiled: list[Rule] = []
    if foundation.enforce_design_tokens:
        compiled.append(Rule(key=rules.RULE_HARDCODED_COLOR, blocking=True))
    compiled.append(Rule(key=rules.RULE_UNAPPROVED_LIB, blocking=True))
    if foundation.quality_gates:
        compiled.append(Rule(key=rules.RULE_QUALITY_GATE, blocking=True))
    return Ruleset(
        rules=tuple(compiled),
        allowed_libraries=frozenset(foundation.allowed_libraries),
        quality_gates=tuple(foundation.quality_gates),
    )
