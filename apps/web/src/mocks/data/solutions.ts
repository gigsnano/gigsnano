import {
  ESolutionAvailability,
  ESolutionCapability,
  ESolutionKey,
  type ISetupDraft,
  type ISolutionDefinition,
  type ISolutionRegistry,
} from "@/types";
import { SETUP_DRAFT_STEP } from "@/lib/solutions/setup-flow";

/**
 * Built-in solution definitions (GIN-443). This is backend-owned data living
 * below the service boundary — at cutover the Python API serves the same shape
 * and this file is deleted. Nothing above `services/` imports it.
 */

/** Bumped whenever any definition below changes, so caches invalidate. */
const REGISTRY_REVISION = "2026-07-25.1";

const softwareDelivery: ISolutionDefinition = {
  key: ESolutionKey.SoftwareDelivery,
  version: 1,
  name: "Software Delivery",
  outcome: "Build and operate production-ready software",
  description:
    "Take an idea, a repository or a pile of documents through to verified delivery, with agents doing the planning work alongside you.",
  container_noun: "project",
  capabilities: [
    ESolutionCapability.Journeys,
    ESolutionCapability.Repositories,
    ESolutionCapability.DomainObjects,
    ESolutionCapability.Dashboards,
    ESolutionCapability.Integrations,
    ESolutionCapability.Agents,
  ],
  starting_points: [
    {
      key: "idea",
      label: "Start from an idea",
      hint: "Greenfield — the agents draft the brief, PRD and architecture with you",
      recommended: true,
      requires_capability: null,
    },
    {
      key: "repository",
      label: "Connect an existing repository",
      hint: "Brownfield — we read the codebase and document what is already there",
      recommended: false,
      requires_capability: ESolutionCapability.Repositories,
    },
    {
      key: "documents",
      label: "Import specifications or designs",
      hint: "Bring your own PRD, designs or delivery docs and we map them in",
      recommended: false,
      requires_capability: null,
    },
    {
      key: "in_flight",
      label: "Continue an implementation",
      hint: "Work already underway — pick up from the current state",
      recommended: false,
      requires_capability: ESolutionCapability.Repositories,
    },
    {
      key: "blueprint",
      label: "Use a blueprint",
      hint: "Start from a reviewed setup someone already proved out",
      recommended: false,
      requires_capability: null,
    },
    {
      key: "blank",
      label: "Blank project",
      hint: "No generated setup — you get less automation, not fewer options",
      recommended: false,
      requires_capability: null,
    },
  ],
  navigation: [
    { key: "overview", label: "Overview", path: "", requires_capability: null },
    { key: "journey", label: "Journey", path: "journey", requires_capability: ESolutionCapability.Journeys },
    { key: "work-items", label: "Work items", path: "issues", requires_capability: null },
    { key: "cycles", label: "Cycles", path: "cycles", requires_capability: null },
    { key: "modules", label: "Modules", path: "modules", requires_capability: null },
    { key: "codebase", label: "Codebase", path: "codebase", requires_capability: ESolutionCapability.Repositories },
    { key: "views", label: "Views", path: "views", requires_capability: null },
  ],
  availability: ESolutionAvailability.Available,
  availability_reason: null,
};

const revenueAssurance: ISolutionDefinition = {
  key: ESolutionKey.RevenueAssurance,
  version: 1,
  name: "Revenue Assurance",
  outcome: "Detect and recover missing or blocked invoice revenue",
  description:
    "Turn contract obligations into billing expectations, then find the invoices that were never raised, rejected or short-paid — with the evidence attached.",
  container_noun: "assurance workspace",
  capabilities: [
    ESolutionCapability.DomainObjects,
    ESolutionCapability.Dashboards,
    ESolutionCapability.Integrations,
    ESolutionCapability.Agents,
  ],
  starting_points: [
    {
      key: "diagnostic",
      label: "Run a historical diagnostic",
      hint: "Point us at last year's contracts and invoices to size the leakage",
      recommended: true,
      requires_capability: null,
    },
    {
      key: "import",
      label: "Import contracts and invoice extracts",
      hint: "Bring the source-of-truth files and we extract the obligations",
      recommended: false,
      requires_capability: null,
    },
    {
      key: "sources",
      label: "Configure document and mailbox sources",
      hint: "Approve specific shared mailboxes and folders — never every inbox",
      recommended: false,
      requires_capability: ESolutionCapability.Integrations,
    },
    {
      key: "blueprint",
      label: "Start from an approved blueprint",
      hint: "A reviewed assurance setup with the four standard controls",
      recommended: false,
      requires_capability: null,
    },
  ],
  navigation: [
    { key: "home", label: "Assurance Home", path: "", requires_capability: null },
    { key: "contracts", label: "Contracts", path: "contracts", requires_capability: null },
    { key: "expectations", label: "Billing Expectations", path: "expectations", requires_capability: null },
    { key: "evidence", label: "Evidence", path: "evidence", requires_capability: ESolutionCapability.Integrations },
    { key: "exceptions", label: "Exceptions", path: "exceptions", requires_capability: null },
    { key: "recoveries", label: "Recoveries", path: "recoveries", requires_capability: null },
    { key: "controls", label: "Controls", path: "controls", requires_capability: null },
    { key: "audit", label: "Audit", path: "audit", requires_capability: null },
  ],
  // Off until the Wave 6 pilot blueprint (GIN-472) exists. The chooser shows it
  // so the platform's direction is visible, but it cannot be started.
  availability: ESolutionAvailability.Disabled,
  availability_reason:
    "Revenue Assurance is in limited pilot. Ask a workspace admin to request access.",
};

const DEFINITIONS: ISolutionDefinition[] = [softwareDelivery, revenueAssurance];

/**
 * Dev affordance mirroring `gn_mock_plan`: set localStorage
 * `gn_mock_solutions` to a comma-separated list of keys to force-enable them,
 * so the Revenue Assurance path can be exercised before its backend exists.
 */
function forcedEnabledKeys(): Set<string> {
  try {
    const raw = localStorage.getItem("gn_mock_solutions");
    return new Set(raw ? raw.split(",").map((k) => k.trim()) : []);
  } catch {
    return new Set();
  }
}

export function getMockSolutionRegistry(): ISolutionRegistry {
  const forced = forcedEnabledKeys();
  return {
    revision: REGISTRY_REVISION,
    solutions: DEFINITIONS.map((solution) =>
      forced.has(solution.key)
        ? { ...solution, availability: ESolutionAvailability.Available, availability_reason: null }
        : solution,
    ),
  };
}

export function getMockSolutionVersion(key: ESolutionKey): number {
  return DEFINITIONS.find((s) => s.key === key)?.version ?? 1;
}

/** In-memory draft store. Mutable across a session, reset on reload. */
export const setupDrafts: ISetupDraft[] = [];

const DRAFT_TTL_DAYS = 30;

export function makeMockSetupDraft(
  workspaceSlug: string,
  solutionKey: ESolutionKey,
  startingPoint: string | null,
  createdBy: string,
): ISetupDraft {
  const now = new Date();
  const expires = new Date(now.getTime() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
  return {
    id: `draft_${Math.random().toString(36).slice(2, 10)}`,
    workspace_slug: workspaceSlug,
    solution_key: solutionKey,
    solution_version: getMockSolutionVersion(solutionKey),
    starting_point: startingPoint,
    // Selecting a solution lands the user on that solution's setup step, so the
    // draft records it as the resume target from the moment it exists.
    step: SETUP_DRAFT_STEP,
    values: {},
    created_by: createdBy,
    revision: 1,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
}
