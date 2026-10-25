from dataclasses import dataclass


@dataclass(frozen=True)
class Foundation:
    """A locked Foundation, in descriptive form (the enforcement source of truth)."""

    allowed_libraries: tuple[str, ...]
    enforce_design_tokens: bool
    quality_gates: tuple[str, ...]


@dataclass(frozen=True)
class Rule:
    key: str
    blocking: bool


@dataclass(frozen=True)
class Ruleset:
    rules: tuple[Rule, ...]
    allowed_libraries: frozenset[str]
    quality_gates: tuple[str, ...]


@dataclass(frozen=True)
class ChangedLine:
    file: str
    line: int
    text: str


@dataclass(frozen=True)
class Violation:
    rule: str
    file: str
    line: int
    blocking: bool
    detail: str


@dataclass(frozen=True)
class ValidationResult:
    status: str  # "pass" | "fail"
    violations: tuple[Violation, ...]
