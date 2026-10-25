import { ESolutionKey } from "@/types";
import {
  EBlueprintLifecycle,
  EBlueprintVisibility,
  type IBlueprintDefinition,
} from "@/types/solution/blueprint";

function base(
  partial: Pick<IBlueprintDefinition, "identity" | "journey_ref" | "work_graph" | "domains"> &
    Partial<IBlueprintDefinition>,
): IBlueprintDefinition {
  return {
    lifecycle: EBlueprintLifecycle.Approved,
    visibility: EBlueprintVisibility.BuiltIn,
    parameters: [],
    views: [],
    documents: [],
    milestones: [],
    integrations: [],
    agent_roles: [],
    approvals: [],
    dashboards: [],
    success_measures: [],
    migration: {
      allow_auto_upgrade: false,
      from_versions: [],
      notes: "V1 installs pin the digest; upgrades are explicit.",
    },
    ...partial,
  };
}

/** Representative Software Delivery greenfield blueprint (GIN-451 fixture). */
export const softwareDeliveryBlueprint: IBlueprintDefinition = base({
  identity: {
    key: "sd.greenfield.default",
    version: 1,
    name: "Software Delivery — greenfield",
    description: "Sprint-0 journey, epics and agent roles for a new product.",
    solution_key: ESolutionKey.SoftwareDelivery,
    solution_version_min: 1,
  },
  journey_ref: "idea",
  domains: [
    { key: "delivery", label: "Delivery", segment: "issues" },
    { key: "docs", label: "Docs", segment: "pages" },
  ],
  views: [
    { key: "board", label: "Board", kind: "board" },
    { key: "backlog", label: "Backlog", kind: "list" },
  ],
  documents: [
    { key: "prd", title: "Product requirements", template_ref: "bmad.prd" },
    { key: "architecture", title: "Architecture", template_ref: "bmad.architecture" },
  ],
  milestones: [
    { key: "sprint0", label: "Sprint 0", order: 0 },
    { key: "mvp", label: "MVP", order: 1 },
  ],
  work_graph: [
    { key: "brief", label: "Project brief", depends_on: [] },
    { key: "prd", label: "PRD", depends_on: ["brief"] },
    { key: "architecture", label: "Architecture", depends_on: ["prd"] },
    { key: "epics", label: "Epics & stories", depends_on: ["prd", "architecture"] },
    { key: "sprint_plan", label: "Sprint plan", depends_on: ["epics"] },
  ],
  integrations: [
    { connector_key: "github", capabilities: ["repos.read", "repos.write"] },
  ],
  agent_roles: [
    { key: "analyst", label: "Analyst", skill_profile_ref: "bmad.analyst" },
    { key: "pm", label: "Product Manager", skill_profile_ref: "bmad.pm" },
    { key: "architect", label: "Architect", skill_profile_ref: "bmad.architect" },
  ],
  approvals: [{ key: "prd_signoff", label: "PRD sign-off", required: true }],
  dashboards: [{ key: "progress", label: "Delivery progress" }],
  success_measures: [
    { key: "sprint0_done", label: "Sprint 0 complete", metric: "stories.done.sprint0" },
  ],
});

/** Representative Revenue Assurance blueprint (GIN-451 fixture). */
export const revenueAssuranceBlueprint: IBlueprintDefinition = base({
  identity: {
    key: "ra.diagnostic.default",
    version: 1,
    name: "Revenue Assurance — diagnostic",
    description: "Four controls, evidence domains and recovery lanes.",
    solution_key: ESolutionKey.RevenueAssurance,
    solution_version_min: 1,
  },
  journey_ref: "diagnostic",
  domains: [
    { key: "contracts", label: "Contracts", segment: "contracts" },
    { key: "evidence", label: "Evidence", segment: "evidence" },
    { key: "exceptions", label: "Exceptions", segment: "exceptions" },
    { key: "recoveries", label: "Recoveries", segment: "recoveries" },
  ],
  views: [{ key: "controls", label: "Controls board", kind: "dashboard" }],
  documents: [
    { key: "control_pack", title: "Control pack", template_ref: "ra.controls" },
  ],
  milestones: [{ key: "baseline", label: "Baseline diagnostic", order: 0 }],
  work_graph: [
    { key: "scope", label: "Scope period", depends_on: [] },
    { key: "ingest", label: "Ingest sources", depends_on: ["scope"] },
    { key: "controls", label: "Run four controls", depends_on: ["ingest"] },
    { key: "exceptions", label: "Triage exceptions", depends_on: ["controls"] },
    { key: "recoveries", label: "Open recoveries", depends_on: ["exceptions"] },
  ],
  integrations: [
    { connector_key: "shared_mailbox", capabilities: ["mail.read"] },
    { connector_key: "document_store", capabilities: ["files.read"] },
    { connector_key: "erp_file_import", capabilities: ["files.read"] },
  ],
  agent_roles: [
    { key: "assurance_lead", label: "Assurance lead", skill_profile_ref: null },
  ],
  approvals: [{ key: "waiver", label: "Exception waiver", required: true }],
  dashboards: [{ key: "leakage", label: "Leakage overview" }],
  success_measures: [
    { key: "exceptions_closed", label: "Exceptions closed", metric: "ra.exceptions.closed" },
  ],
});

export const BLUEPRINT_FIXTURES: IBlueprintDefinition[] = [
  softwareDeliveryBlueprint,
  revenueAssuranceBlueprint,
];
