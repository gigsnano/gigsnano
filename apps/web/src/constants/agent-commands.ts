import type { ID } from "@/types/common";

export interface IAgentCommand {
  id: string;
  slash: string;
  label: string;
  description: string;
  agent_ids: ID[];
  prompt_template?: string;
  action?: "open-epic-breakdown" | "send-prompt";
}

/** GigsAI slash commands — filtered by selected BMAD agent. */
export const AGENT_COMMANDS: IAgentCommand[] = [
  {
    id: "break-down-epic",
    slash: "/break-down-epic",
    label: "Break down epic",
    description: "Turn an epic description into stories and tasks under that epic.",
    agent_ids: ["agent_pm", "agent_sm"],
    action: "open-epic-breakdown",
  },
  {
    id: "draft-prd",
    slash: "/draft-prd",
    label: "Draft PRD",
    description: "Outline product requirements from the current project context.",
    agent_ids: ["agent_pm"],
    prompt_template: "Help me draft a PRD for this project based on what we know so far.",
    action: "send-prompt",
  },
  {
    id: "create-epics",
    slash: "/create-epics",
    label: "Create epics",
    description: "Propose epics and stories from the PRD and architecture.",
    agent_ids: ["agent_pm"],
    prompt_template: "Propose epics and stories for this project from the PRD and architecture.",
    action: "send-prompt",
  },
  {
    id: "correct-course",
    slash: "/correct-course",
    label: "Correct course",
    description: "Review scope drift and suggest corrections.",
    agent_ids: ["agent_pm"],
    prompt_template: "Review our current scope and suggest course corrections.",
    action: "send-prompt",
  },
  {
    id: "sprint-planning",
    slash: "/sprint-planning",
    label: "Sprint planning",
    description: "Draft a sprint plan from the current backlog.",
    agent_ids: ["agent_sm"],
    prompt_template: "Help me draft a sprint plan from the current project backlog.",
    action: "send-prompt",
  },
  {
    id: "retrospective",
    slash: "/retrospective",
    label: "Retrospective",
    description: "Facilitate a sprint retrospective.",
    agent_ids: ["agent_sm"],
    prompt_template: "Facilitate a retrospective for our latest sprint.",
    action: "send-prompt",
  },
  {
    id: "brainstorm",
    slash: "/brainstorm",
    label: "Brainstorm",
    description: "Explore ideas and problem space.",
    agent_ids: ["agent_analyst"],
    prompt_template: "Let's brainstorm approaches for our current challenge.",
    action: "send-prompt",
  },
  {
    id: "research",
    slash: "/research",
    label: "Research",
    description: "Summarize research findings for a topic.",
    agent_ids: ["agent_analyst"],
    prompt_template: "Research and summarize the key findings for our topic.",
    action: "send-prompt",
  },
  {
    id: "product-brief",
    slash: "/product-brief",
    label: "Product brief",
    description: "Draft a concise product brief.",
    agent_ids: ["agent_analyst"],
    prompt_template: "Help me draft a product brief for this initiative.",
    action: "send-prompt",
  },
  {
    id: "create-architecture",
    slash: "/create-architecture",
    label: "Create architecture",
    description: "Propose a technical architecture.",
    agent_ids: ["agent_architect"],
    prompt_template: "Propose a technical architecture for this project.",
    action: "send-prompt",
  },
  {
    id: "readiness-check",
    slash: "/readiness-check",
    label: "Readiness check",
    description: "Run an implementation-readiness review.",
    agent_ids: ["agent_architect"],
    prompt_template: "Run an implementation-readiness check on our planning artifacts.",
    action: "send-prompt",
  },
  {
    id: "ux-design",
    slash: "/ux-design",
    label: "UX design",
    description: "Outline UX flows and visual direction.",
    agent_ids: ["agent_ux"],
    prompt_template: "Outline UX flows and visual direction for this product.",
    action: "send-prompt",
  },
  {
    id: "create-story",
    slash: "/create-story",
    label: "Create story",
    description: "Draft a dev-ready story file.",
    agent_ids: ["agent_dev"],
    prompt_template: "Draft a dev-ready story file for the selected work item.",
    action: "send-prompt",
  },
  {
    id: "dev-story",
    slash: "/dev-story",
    label: "Dev story",
    description: "Plan implementation steps for a story.",
    agent_ids: ["agent_dev"],
    prompt_template: "Plan implementation steps for this story.",
    action: "send-prompt",
  },
  {
    id: "code-review",
    slash: "/code-review",
    label: "Code review",
    description: "Review code changes against the story.",
    agent_ids: ["agent_dev"],
    prompt_template: "Review the proposed code changes against the story acceptance criteria.",
    action: "send-prompt",
  },
  {
    id: "generate-e2e-tests",
    slash: "/generate-e2e-tests",
    label: "Generate E2E tests",
    description: "Propose end-to-end test scenarios.",
    agent_ids: ["agent_qa"],
    prompt_template: "Generate end-to-end test scenarios for this feature.",
    action: "send-prompt",
  },
];
