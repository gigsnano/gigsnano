/**
 * Sprint-0 step definitions — source of truth: docs/base-guides/bmad-workflow-guide.md §6
 */

export type TBmadStep = {
  title: string;
  workflow: string;
  agent: string;
  artifact: string;
  required: boolean;
  description: string;
  /** Conditional on project.has_ui */
  requires_ui?: boolean;
};

export const FRESH_SPRINT_ZERO_STEPS: TBmadStep[] = [
  { title: "Choose your planning track", workflow: "track-selection", agent: "Analyst · Mary", artifact: "track decision", required: true, description: "Pick the rigor: Quick Flow, BMad Method, or Enterprise." },
  { title: "Brainstorm the idea", workflow: "bmad-brainstorming", agent: "Analyst · Mary", artifact: "brainstorm.md", required: false, description: "Guided ideation to sharpen the concept." },
  { title: "Research market, domain & tech", workflow: "bmad-research", agent: "Analyst · Mary", artifact: "research.md", required: false, description: "Validate market, domain, and technical assumptions." },
  { title: "Write the Product Brief", workflow: "bmad-product-brief", agent: "Analyst · Mary", artifact: "brief.md", required: false, description: "Capture the strategic vision and scope." },
  { title: "Create the PRD", workflow: "bmad-prd", agent: "Product Manager · John", artifact: "prd.md", required: true, description: "Define what to build and for whom." },
  { title: "Design the UX", workflow: "bmad-ux", agent: "UI/UX Architect · Sally", artifact: "DESIGN.md + EXPERIENCE.md", required: false, requires_ui: true, description: "Visual and behavioral design (if the product has a UI)." },
  { title: "Create the Architecture", workflow: "bmad-create-architecture", agent: "Architect · Winston", artifact: "architecture.md", required: true, description: "Make the technical decisions explicit." },
  { title: "Break down Epics & Stories", workflow: "bmad-create-epics-and-stories", agent: "Product Manager · John", artifact: "epics.md", required: true, description: "Turn requirements into implementable work." },
  { title: "Implementation Readiness gate", workflow: "bmad-check-implementation-readiness", agent: "Architect · Winston", artifact: "PASS / CONCERNS / FAIL", required: true, description: "Validate cohesion across all planning docs." },
  { title: "Sprint Planning", workflow: "bmad-sprint-planning", agent: "Scrum Master · Amelia", artifact: "sprint-status.yaml", required: true, description: "Sequence the dev cycle and seed the sprint board." },
];

export const BROWNFIELD_SPRINT_ZERO_STEPS: TBmadStep[] = [
  { title: "Clean up stale planning artifacts", workflow: "cleanup-artifacts", agent: "Analyst · Mary", artifact: "tidy repo", required: false, description: "Archive old PRDs and story files so they don't pollute context." },
  { title: "Document the existing project", workflow: "bmad-document-project", agent: "Analyst · Paige", artifact: "docs/ current-state", required: false, description: "Scan and document the codebase's real current state." },
  { title: "Generate project context", workflow: "bmad-generate-project-context", agent: "Analyst · Mary", artifact: "project-context.md", required: true, description: "Detect tech stack, patterns, and conventions from the repo." },
  { title: "Decide scope: quick fix vs full method", workflow: "scope-selection", agent: "Analyst · Mary", artifact: "scope decision", required: true, description: "Choose Quick Flow for small changes or full BMad Method." },
  { title: "Create/update PRD (context-aware)", workflow: "bmad-prd", agent: "Product Manager · John", artifact: "prd.md", required: true, description: "Define changes integrating with the existing system." },
  { title: "Design the UX", workflow: "bmad-ux", agent: "UI/UX Architect · Sally", artifact: "DESIGN.md + EXPERIENCE.md", required: false, requires_ui: true, description: "UX changes for new or updated UI surfaces." },
  { title: "Create the Architecture", workflow: "bmad-create-architecture", agent: "Architect · Winston", artifact: "architecture.md", required: true, description: "Reconcile technical decisions with the existing codebase." },
  { title: "Break down Epics & Stories", workflow: "bmad-create-epics-and-stories", agent: "Product Manager · John", artifact: "epics.md", required: true, description: "Break requirements into implementable work." },
  { title: "Implementation Readiness gate", workflow: "bmad-check-implementation-readiness", agent: "Architect · Winston", artifact: "PASS / CONCERNS / FAIL", required: true, description: "Validate cohesion across all planning docs." },
  { title: "Sprint Planning", workflow: "bmad-sprint-planning", agent: "Scrum Master · Amelia", artifact: "sprint-status.yaml", required: true, description: "Sequence the dev cycle and seed the sprint board." },
];
