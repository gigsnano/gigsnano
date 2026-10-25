export interface IBmadAgent {
  id: string;
  name: string;
  persona: string;
  skill_id: string;
  description: string;
  workflows: string[];
  /** Owning phase label for display. */
  phase: string;
}

/** Static BMAD v6 roster — see docs/base-guides/bmad-workflow-guide.md §2. */
export const BMAD_AGENTS: IBmadAgent[] = [
  {
    id: "agent_analyst",
    name: "Analyst",
    persona: "Mary",
    skill_id: "bmad-agent-analyst",
    phase: "Analysis",
    description: "Explores the problem space — brainstorming, research, product brief, and brownfield documentation.",
    workflows: ["bmad-brainstorming", "bmad-research", "bmad-product-brief", "bmad-document-project"],
  },
  {
    id: "agent_pm",
    name: "Product Manager",
    persona: "John",
    skill_id: "bmad-agent-pm",
    phase: "Planning",
    description: "Defines what to build — PRD, epics, stories, and scope corrections.",
    workflows: ["bmad-prd", "bmad-create-epics-and-stories", "bmad-correct-course"],
  },
  {
    id: "agent_architect",
    name: "Architect",
    persona: "Winston",
    skill_id: "bmad-agent-architect",
    phase: "Solutioning",
    description: "Makes technical decisions explicit and runs the implementation-readiness gate.",
    workflows: ["bmad-create-architecture", "bmad-check-implementation-readiness"],
  },
  {
    id: "agent_ux",
    name: "UI/UX Architect",
    persona: "Sally",
    skill_id: "bmad-agent-ux-designer",
    phase: "Planning",
    description: "Designs visual and behavioral UX when the product has a UI.",
    workflows: ["bmad-ux"],
  },
  {
    id: "agent_sm",
    name: "Scrum Master",
    persona: "Amelia",
    skill_id: "bmad-agent-dev",
    phase: "Implementation",
    description: "Sequences the dev cycle — sprint planning and retrospectives (DEV-owned in BMAD v6).",
    workflows: ["bmad-sprint-planning", "bmad-retrospective"],
  },
  {
    id: "agent_dev",
    name: "Developer",
    persona: "Amelia",
    skill_id: "bmad-agent-dev",
    phase: "Implementation",
    description: "Build engine — story implementation, code review, and quick dev flows.",
    workflows: ["bmad-create-story", "bmad-dev-story", "bmad-code-review", "bmad-quick-dev"],
  },
  {
    id: "agent_qa",
    name: "Test Engineer",
    persona: "Amelia",
    skill_id: "bmad-agent-dev",
    phase: "Implementation",
    description: "Generates E2E tests via the Developer agent's QA workflow.",
    workflows: ["bmad-qa-generate-e2e-tests"],
  },
];
