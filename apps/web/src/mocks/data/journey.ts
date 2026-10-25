import {
  EExecutor,
  EJourneyPhase,
  EStepState,
  type IJourney,
  type IJourneyStep,
} from "@/types/journey/journey";

/**
 * One realistic Project Journey fixture (CampusFlow-style): Define fully
 * verified, Experience active with a review waiting, everything downstream
 * locked behind prerequisites. Exercises every render state the shell needs.
 *
 * Mock-first: served below the service boundary. A real Phase-0 API replaces
 * this without touching hooks/components.
 */
const STEPS: IJourneyStep[] = [
  // Define — complete
  {
    id: "d_idea",
    phase: EJourneyPhase.Define,
    title: "Describe idea",
    purpose: "Capture the product idea, target users and the outcome you want.",
    state: EStepState.Verified,
    applicable: true,
    prerequisites: [],
    skippable: false,
    inputs: ["Idea summary", "Target users"],
    decisions: [{ label: "Product type", value: "Web app" }],
    output: { label: "Idea brief", type: "idea_brief", version: 1, verified: true },
    executor: EExecutor.Self,
    updated_at: "2026-07-20T09:00:00Z",
  },
  {
    id: "d_research",
    phase: EJourneyPhase.Define,
    title: "Research",
    purpose: "Validate the problem and survey comparable products.",
    state: EStepState.Verified,
    applicable: true,
    prerequisites: ["d_idea"],
    skippable: true,
    inputs: ["Idea brief"],
    decisions: [],
    output: { label: "Research summary", type: "research", version: 1, verified: true },
    executor: EExecutor.Ai,
    updated_at: "2026-07-21T11:30:00Z",
  },
  {
    id: "d_brief",
    phase: EJourneyPhase.Define,
    title: "Product brief",
    purpose: "Agree the problem, audience, goals and success measures.",
    state: EStepState.Verified,
    applicable: true,
    prerequisites: ["d_research"],
    skippable: false,
    inputs: ["Research summary"],
    decisions: [],
    output: { label: "Product brief", type: "product_brief", version: 2, verified: true },
    executor: EExecutor.Ai,
    updated_at: "2026-07-22T14:05:00Z",
  },
  {
    id: "d_prd",
    phase: EJourneyPhase.Define,
    title: "PRD",
    purpose: "Detail requirements, scope and acceptance for the product.",
    state: EStepState.Verified,
    applicable: true,
    prerequisites: ["d_brief"],
    skippable: false,
    inputs: ["Product brief"],
    decisions: [],
    output: { label: "PRD", type: "prd", version: 2, verified: true },
    executor: EExecutor.Ai,
    updated_at: "2026-07-23T10:15:00Z",
  },
  // Experience — active, review waiting
  {
    id: "x_visual",
    phase: EJourneyPhase.Experience,
    title: "Visual direction",
    purpose: "Choose and approve how the product should look and feel before architecture begins.",
    state: EStepState.ReviewRequired,
    applicable: true,
    prerequisites: ["d_prd"],
    skippable: false,
    inputs: ["PRD", "Target users"],
    decisions: [
      { label: "Direction", value: "B · Focused modern" },
      { label: "Theme" },
      { label: "Density" },
    ],
    output: { label: "Experience contract", type: "experience_contract", version: 1, verified: false },
    executor: EExecutor.Ai,
    effort: "~10 min",
    approver: "You",
    downstream_impact: ["Solution topology", "Delivery plan"],
    surface: "experience",
    updated_at: "2026-07-24T08:40:00Z",
  },
  {
    id: "x_flows",
    phase: EJourneyPhase.Experience,
    title: "Screen flows",
    purpose: "Select the critical screens and flows the product must support.",
    state: EStepState.NotStarted,
    applicable: true,
    prerequisites: ["x_visual"],
    skippable: false,
    inputs: ["Experience contract"],
    decisions: [],
    updated_at: "2026-07-24T08:40:00Z",
  },
  // Engineer — locked
  {
    id: "e_topology",
    phase: EJourneyPhase.Engineer,
    title: "Solution topology",
    purpose: "Model the layers, components, repositories and dependencies.",
    state: EStepState.NotStarted,
    applicable: true,
    prerequisites: ["x_flows"],
    skippable: false,
    inputs: ["Experience contract", "PRD"],
    decisions: [],
    surface: "topology",
    updated_at: "2026-07-24T08:40:00Z",
  },
  // Plan — locked
  {
    id: "p_epics",
    phase: EJourneyPhase.Plan,
    title: "Layer-aware delivery plan",
    purpose: "Generate epics, vertical stories and layer tasks from approved inputs.",
    state: EStepState.NotStarted,
    applicable: true,
    prerequisites: ["e_topology"],
    skippable: false,
    inputs: ["Topology", "PRD"],
    decisions: [],
    surface: "delivery",
    updated_at: "2026-07-24T08:40:00Z",
  },
  // Deliver — locked
  {
    id: "dl_cycle",
    phase: EJourneyPhase.Deliver,
    title: "Start delivery",
    purpose: "Confirm the first cycle, owners and capacity, then launch delivery.",
    state: EStepState.NotStarted,
    applicable: true,
    prerequisites: ["p_epics"],
    skippable: false,
    inputs: ["Delivery plan"],
    decisions: [],
    updated_at: "2026-07-24T08:40:00Z",
  },
];

export function journeyForProject(projectId: string): IJourney {
  return { id: `journey_${projectId}`, project_id: projectId, steps: structuredClone(STEPS) };
}
