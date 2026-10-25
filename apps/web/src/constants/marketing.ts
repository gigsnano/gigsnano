/**
 * Landing-page content as typed data (GIN-27). Copy lives here, not in JSX, so
 * sections stay presentational and the marketing message is edited in one place.
 * Icons are Hugeicons data objects passed to <HugeiconsIcon icon={...} />.
 */
import {
  AiBrain01Icon,
  Analytics01Icon,
  Calendar03Icon,
  CreditCardIcon,
  Download01Icon,
  FileEditIcon,
  GitBranchIcon,
  KanbanIcon,
  Layers01Icon,
  Notification01Icon,
  ShieldKeyIcon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";

/** Hugeicons icon-data object, inferred from a concrete icon. */
export type MarketingIcon = typeof WorkflowSquare01Icon;

export interface IMarketingPillar {
  icon: MarketingIcon;
  title: string;
  body: string;
}

export const MARKETING_PILLARS: IMarketingPillar[] = [
  {
    icon: WorkflowSquare01Icon,
    title: "Sprint-0, out of the box",
    body: "Every new project seeds an opinionated planning board — brief, PRD, architecture, epics, and sprint plan — with unlock dependencies already wired.",
  },
  {
    icon: AiBrain01Icon,
    title: "An agent on every card",
    body: "Analyst, PM, Architect, Scrum Master, Developer — each planning step opens a focused AI chat thread pre-loaded with the work you've done so far.",
  },
  {
    icon: FileEditIcon,
    title: "Docs you can actually review",
    body: "Generated artifacts land in a comment-friendly editor. Select a block, leave a note, assign it — then sync the whole set to a fresh GitHub repo.",
  },
];

export interface IMarketingStep {
  label: string;
  title: string;
  body: string;
}

/** The real BMAD unlock sequence — order carries meaning, so it's numbered. */
export const MARKETING_STEPS: IMarketingStep[] = [
  {
    label: "Create",
    title: "Start a project",
    body: "Pick greenfield or brownfield. GigsNano spins up a Sprint-0 cycle and lands you on the board.",
  },
  {
    label: "Work the card",
    title: "Chat with the owning agent",
    body: "Open a card and its BMAD agent is already there, holding the prior artifacts as context.",
  },
  {
    label: "Unlock",
    title: "Finish one, reveal the next",
    body: "Architecture needs the PRD. Stories need both. The graph enforces the order so nothing skips ahead.",
  },
  {
    label: "Ship",
    title: "Leave with a plan",
    body: "By the end of Sprint-0 you have a brief, PRD, architecture, epics, stories, and a sprint plan.",
  },
];

export interface IMarketingAgent {
  initials: string;
  role: string;
  /** Accent color, matching the hero's agent palette. */
  color: string;
  /** The BMAD artifact this agent owns in Sprint-0. */
  owns: string;
}

/** The BMAD roster, in method order. */
export const MARKETING_AGENTS: IMarketingAgent[] = [
  { initials: "AN", role: "Analyst", color: "oklch(0.701 0.2 6.638)", owns: "Product Brief" },
  { initials: "PM", role: "Product Manager", color: "oklch(0.817 0.164 75.837)", owns: "PRD" },
  { initials: "AR", role: "Architect", color: "oklch(0.709 0.159 293.541)", owns: "Architecture" },
  { initials: "UX", role: "UI/UX", color: "oklch(0.725 0.175 349.761)", owns: "UX Spec" },
  { initials: "SM", role: "Scrum Master", color: "oklch(0.762 0.154 159.355)", owns: "Epics & Stories" },
  { initials: "DV", role: "Developer", color: "oklch(0.671 0.177 254.495)", owns: "Implementation" },
  { initials: "QA", role: "Test Engineer", color: "oklch(0.797 0.134 211.53)", owns: "Readiness Gate" },
];

/** Ecosystem strip (marquee). */
export const MARKETING_TOOLS = [
  "Next.js",
  "FastAPI",
  "GitHub",
  "Slack",
  "Jira",
  "OpenAI",
  "Anthropic",
  "PostgreSQL",
  "Stripe",
  "Google",
  "Azure",
  "MCP",
];

export type ShowcaseMock = "agents" | "workItems" | "marketplace";

export interface IMarketingShowcase {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  mock: ShowcaseMock;
  /** Visual side: mock on the right (default) or left. */
  flip?: boolean;
}

export const MARKETING_SHOWCASES: IMarketingShowcase[] = [
  {
    eyebrow: "BMAD agents",
    title: "Specialized AI, embedded in the workflow",
    body: "Not one generic assistant — a roster of role-specific agents that each own a step of the method and hand off cleanly to the next.",
    bullets: [
      "Fresh chat thread per workflow, pre-loaded with prior artifacts",
      "Streams live over the same interface your team already uses",
      "Turns the conversation into a reviewable document, not just text",
    ],
    mock: "agents",
  },
  {
    eyebrow: "Work items",
    title: "See your work five ways",
    body: "The same stories, rendered as a list, a kanban board, a calendar, a spreadsheet, or a Gantt timeline. Switch layout without losing your place.",
    bullets: [
      "Group, filter, and order that persist across sessions",
      "Sub-issues, relations, comments, and history on every item",
      "Priorities, estimates, cycles, and modules built in",
    ],
    mock: "workItems",
    flip: true,
  },
  {
    eyebrow: "Marketplace",
    title: "Bring in help without leaving the plan",
    body: "A freelance marketplace lives inside GigsNano — post work, hire talent, and delegate straight from a card, with escrow handling the money.",
    bullets: [
      "Publish a job or delegate a work item to a coding agent",
      "Prepaid wallet with escrow, so payment is scoped to the work",
      "Freelancer profiles, proposals, and contracts in one place",
    ],
    mock: "marketplace",
  },
];

export interface IFeatureGridItem {
  icon: MarketingIcon;
  title: string;
  body: string;
}

export const MARKETING_FEATURES: IFeatureGridItem[] = [
  { icon: KanbanIcon, title: "Boards & backlogs", body: "Kanban, list, calendar, table, Gantt." },
  { icon: Calendar03Icon, title: "Cycles", body: "Time-boxed sprints, live progress." },
  { icon: Layers01Icon, title: "Modules", body: "Group work into milestones." },
  { icon: Analytics01Icon, title: "Analytics", body: "Dashboards across every project." },
  { icon: GitBranchIcon, title: "GitHub sync", body: "Push generated docs to a repo." },
  { icon: Download01Icon, title: "Exports", body: "CSV, JSON, and XLSX." },
  { icon: Notification01Icon, title: "Notifications", body: "In-app and email alerts." },
  { icon: ShieldKeyIcon, title: "Roles & access", body: "Owner, admin, member, guest." },
  { icon: CreditCardIcon, title: "Cost transparency", body: "See AI spend per workspace." },
];

export interface IFooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export const MARKETING_FOOTER: IFooterColumn[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Marketplace", href: "/marketplace" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Sign up", href: "/sign-up" },
      { label: "Sign in", href: "/sign-in" },
      { label: "Onboarding", href: "/onboarding" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export const MARKETING_NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Marketplace", href: "/marketplace" },
];
