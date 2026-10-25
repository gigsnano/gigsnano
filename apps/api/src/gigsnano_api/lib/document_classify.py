"""Classify a package document by purpose (GIN-395).

Deterministic and free: a delivery package names its files for humans
("design-system.md", "2026-07-22-mobile-phases-0-3.md"), and the first headings
repeat the same words. That signal carries most documents, so the LLM is only
worth spending on the ones this cannot decide — `confidence` is what the caller
gates that on.

Pure: text in, verdict out. No LLM, no DB.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: The classification vocabulary the epic defines. `unknown` is a real answer —
#: guessing a type for supporting material is worse than admitting the doubt.
DOC_TYPES = (
    "product_requirements",
    "architecture",
    "ui_ux",
    "design_system",
    "implementation_plan",
    "test_plan",
    "security",
    "deployment",
    "api_spec",
    "data_model",
    "schedule",
    "unknown",
)

#: Phrases that indicate a type, strongest first. Multi-word phrases score higher
#: than single words because "design system" is evidence where "design" is not.
_SIGNALS: dict[str, tuple[str, ...]] = {
    "product_requirements": ("prd", "product requirements", "requirements", "user stories",
                             "acceptance criteria", "product brief", "brief"),
    "architecture": ("architecture", "system design", "technical design", "adr",
                     "component diagram", "tech stack"),
    "ui_ux": ("ux", "ui spec", "user flows", "wireframe", "screen spec", "prototype",
              "interaction design"),
    "design_system": ("design system", "design tokens", "component library",
                      "style guide", "typography", "colour palette", "color palette"),
    "implementation_plan": ("implementation plan", "phases", "phase 0", "delivery plan",
                            "task plan", "work breakdown", "milestones"),
    "test_plan": ("test plan", "qa plan", "test strategy", "test cases", "regression"),
    "security": ("security", "threat model", "penetration", "compliance", "gdpr", "hipaa"),
    "deployment": ("deployment", "infrastructure", "ci/cd", "release plan", "environments",
                   "runbook"),
    "api_spec": ("api spec", "openapi", "swagger", "endpoints", "rest api", "graphql schema"),
    "data_model": ("data model", "schema", "erd", "entity relationship", "database design",
                   "migrations"),
    "schedule": ("schedule", "timeline", "gantt", "sprint plan", "roadmap", "estimates"),
}

#: Only the first headings matter — a document mentions everything eventually.
_HEAD_CHARS = 1500
_HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$", re.MULTILINE)


@dataclass(frozen=True)
class Classification:
    doc_type: str
    confidence: float  # 0.0–1.0
    signals: list[str]  # the phrases that decided it, for an honest UI


def _haystacks(file_name: str, text: str) -> tuple[str, str]:
    """(name-ish text, body-ish text). The filename and headings are the strong
    signal; the opening body is the weak one."""
    head = text[:_HEAD_CHARS]
    headings = " ".join(_HEADING_RE.findall(head))
    name = f"{file_name.replace('-', ' ').replace('_', ' ')} {headings}".lower()
    return name, head.lower()


def classify_document(*, file_name: str, text: str) -> Classification:
    """Best-effort purpose for one document, with the evidence that decided it."""
    name, body = _haystacks(file_name, text)

    scored: list[tuple[float, str, list[str]]] = []
    for doc_type, phrases in _SIGNALS.items():
        hits: list[str] = []
        score = 0.0
        for phrase in phrases:
            weight = 2.0 if " " in phrase else 1.0
            if phrase in name:
                score += weight * 2  # filename/heading match is the strong signal
                hits.append(phrase)
            elif phrase in body:
                score += weight
                hits.append(phrase)
        if hits:
            scored.append((score, doc_type, hits))

    if not scored:
        return Classification(doc_type="unknown", confidence=0.0, signals=[])

    scored.sort(key=lambda s: (-s[0], s[1]))  # name-sorted tiebreak keeps it deterministic
    best_score, best_type, best_hits = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0

    # Confidence is how far ahead the winner is, not how much it scored — two
    # types tied at a high score is exactly the ambiguous case worth escalating.
    margin = (best_score - runner_up) / best_score
    confidence = round(min(0.95, 0.35 + 0.6 * margin), 2)
    return Classification(doc_type=best_type, confidence=confidence, signals=best_hits[:5])
