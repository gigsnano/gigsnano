"""Sprint-0 step definitions.

Server-side source of truth, ported from the frontend's
src/constants/bmad-sprint-zero.ts (derived from docs/base-guides/bmad-workflow-guide.md §6).
"""

from dataclasses import dataclass

from gigsnano_api.models import EProjectFlow


@dataclass(frozen=True)
class BmadStep:
    title: str
    workflow: str
    agent: str
    artifact: str
    required: bool
    description: str
    requires_ui: bool = False  # step exists only when project.has_ui


FRESH_SPRINT_ZERO_STEPS: tuple[BmadStep, ...] = (
    BmadStep("Choose your planning track", "track-selection", "Analyst · Mary",
             "track decision", True,
             "Pick the rigor: Quick Flow, BMad Method, or Enterprise."),
    BmadStep("Brainstorm the idea", "bmad-brainstorming", "Analyst · Mary",
             "brainstorm.md", False, "Guided ideation to sharpen the concept."),
    BmadStep("Research market, domain & tech", "bmad-research", "Analyst · Mary",
             "research.md", False, "Validate market, domain, and technical assumptions."),
    BmadStep("Write the Product Brief", "bmad-product-brief", "Analyst · Mary",
             "brief.md", False, "Capture the strategic vision and scope."),
    BmadStep("Create the PRD", "bmad-prd", "Product Manager · John", "prd.md", True,
             "Define what to build and for whom."),
    BmadStep("Design the UX", "bmad-ux", "UI/UX Architect · Sally",
             "DESIGN.md + EXPERIENCE.md", False,
             "Visual and behavioral design (if the product has a UI).", requires_ui=True),
    BmadStep("Create the Architecture", "bmad-create-architecture", "Architect · Winston",
             "architecture.md", True, "Make the technical decisions explicit."),
    BmadStep("Break down Epics & Stories", "bmad-create-epics-and-stories",
             "Product Manager · John", "epics.md", True,
             "Turn requirements into implementable work."),
    BmadStep("Implementation Readiness gate", "bmad-check-implementation-readiness",
             "Architect · Winston", "PASS / CONCERNS / FAIL", True,
             "Validate cohesion across all planning docs."),
    BmadStep("Sprint Planning", "bmad-sprint-planning", "Scrum Master · Amelia",
             "sprint-status.yaml", True,
             "Sequence the dev cycle and seed the sprint board."),
)

BROWNFIELD_SPRINT_ZERO_STEPS: tuple[BmadStep, ...] = (
    BmadStep("Clean up stale planning artifacts", "cleanup-artifacts", "Analyst · Mary",
             "tidy repo", False,
             "Archive old PRDs and story files so they don't pollute context."),
    BmadStep("Document the existing project", "bmad-document-project", "Analyst · Paige",
             "docs/ current-state", False,
             "Scan and document the codebase's real current state."),
    BmadStep("Generate project context", "bmad-generate-project-context", "Analyst · Mary",
             "project-context.md", True,
             "Detect tech stack, patterns, and conventions from the repo."),
    BmadStep("Decide scope: quick fix vs full method", "scope-selection", "Analyst · Mary",
             "scope decision", True,
             "Choose Quick Flow for small changes or full BMad Method."),
    BmadStep("Create/update PRD (context-aware)", "bmad-prd", "Product Manager · John",
             "prd.md", True, "Define changes integrating with the existing system."),
    BmadStep("Design the UX", "bmad-ux", "UI/UX Architect · Sally",
             "DESIGN.md + EXPERIENCE.md", False,
             "UX changes for new or updated UI surfaces.", requires_ui=True),
    BmadStep("Create the Architecture", "bmad-create-architecture", "Architect · Winston",
             "architecture.md", True,
             "Reconcile technical decisions with the existing codebase."),
    BmadStep("Break down Epics & Stories", "bmad-create-epics-and-stories",
             "Product Manager · John", "epics.md", True,
             "Break requirements into implementable work."),
    BmadStep("Implementation Readiness gate", "bmad-check-implementation-readiness",
             "Architect · Winston", "PASS / CONCERNS / FAIL", True,
             "Validate cohesion across all planning docs."),
    BmadStep("Sprint Planning", "bmad-sprint-planning", "Scrum Master · Amelia",
             "sprint-status.yaml", True,
             "Sequence the dev cycle and seed the sprint board."),
)


def steps_for(flow: EProjectFlow, has_ui: bool) -> list[BmadStep]:
    steps = (
        BROWNFIELD_SPRINT_ZERO_STEPS
        if flow == EProjectFlow.EXISTING
        else FRESH_SPRINT_ZERO_STEPS
    )
    return [s for s in steps if not s.requires_ui or has_ui]
