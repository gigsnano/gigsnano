import re

from .types import ChangedLine, Violation

RULE_HARDCODED_COLOR = "no-hardcoded-color"
RULE_UNAPPROVED_LIB = "unapproved-library"
RULE_QUALITY_GATE = "quality-gate"

_HEX = re.compile(r"#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])")
_FUNC_COLOR = re.compile(r"\b(?:rgb|rgba|hsl|hsla)\s*\(")
_TW_COLOR = re.compile(
    r"\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|divide|accent|caret)-"
    r"(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|"
    r"sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b"
)


def find_hardcoded_colors(
    lines: list[ChangedLine], *, blocking: bool = True
) -> list[Violation]:
    out: list[Violation] = []
    for ln in lines:
        if _HEX.search(ln.text) or _FUNC_COLOR.search(ln.text) or _TW_COLOR.search(ln.text):
            out.append(
                Violation(
                    rule=RULE_HARDCODED_COLOR,
                    file=ln.file,
                    line=ln.line,
                    blocking=blocking,
                    detail="hardcoded color; use a design token",
                )
            )
    return out


_IMPORT_FROM = re.compile(r"""\bfrom\s+['"]([^'"]+)['"]""")
_IMPORT_BARE = re.compile(r"""\bimport\s+['"]([^'"]+)['"]""")
_REQUIRE = re.compile(r"""\brequire\(\s*['"]([^'"]+)['"]\s*\)""")


def _package_of(specifier: str) -> str | None:
    """External package id for a module specifier, or None if internal/relative."""
    if specifier.startswith((".", "/")) or specifier.startswith("@/"):
        return None
    parts = specifier.split("/")
    if specifier.startswith("@"):
        return "/".join(parts[:2])  # @scope/name
    return parts[0]


def find_unapproved_libraries(
    lines: list[ChangedLine], allowed: frozenset[str], *, blocking: bool = True
) -> list[Violation]:
    out: list[Violation] = []
    for ln in lines:
        specifiers: list[str] = []
        for rx in (_IMPORT_FROM, _IMPORT_BARE, _REQUIRE):
            specifiers += rx.findall(ln.text)
        for spec in specifiers:
            pkg = _package_of(spec)
            if pkg is not None and pkg not in allowed:
                out.append(
                    Violation(
                        rule=RULE_UNAPPROVED_LIB,
                        file=ln.file,
                        line=ln.line,
                        blocking=blocking,
                        detail=f'unapproved library "{pkg}"',
                    )
                )
    return out


def check_quality_gates(
    gate_results: dict[str, bool], required: tuple[str, ...], *, blocking: bool = True
) -> list[Violation]:
    out: list[Violation] = []
    for gate in required:
        passed = gate_results.get(gate)
        if passed is not True:
            detail = f'quality gate "{gate}" ' + ("failed" if passed is False else "not run")
            out.append(
                Violation(
                    rule=RULE_QUALITY_GATE,
                    file="",
                    line=0,
                    blocking=blocking,
                    detail=detail,
                )
            )
    return out
