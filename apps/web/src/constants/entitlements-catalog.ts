import { EPlanTier } from "@/constants/plans";

/**
 * Client display catalog for the server-driven AI-native entitlement keys
 * (`GET /workspaces/{slug}/entitlements/`). The backend owns availability/quota;
 * this only supplies labels, copy, and the min tier for the upgrade CTA — the
 * same open/closed data seam as STORY_*_META. Mirrors the backend ENTITLEMENTS
 * matrix (billing/entitlements.py); keep the two in sync.
 *
 * NOTE: distinct from `EEntitlementFeature` in constants/plans.ts (the GIN-30
 * client-side boolean gates) — different key set, different source of truth.
 */
export interface IEntitlementDef {
  label: string;
  description: string;
  minTier: EPlanTier;
  /** Per-tier monthly quota when metered (null = unlimited on that tier). */
  quotas?: Partial<Record<EPlanTier, number | null>>;
}

export const ENTITLEMENT_CATALOG: Record<string, IEntitlementDef> = {
  agent_runs: {
    label: "Agent runs",
    description: "AI personas that plan and execute your work items.",
    minTier: EPlanTier.Free,
    quotas: { [EPlanTier.Free]: 20, [EPlanTier.Pro]: 500, [EPlanTier.Business]: null },
  },
  task_router: {
    label: "Auto-routing",
    description: "Let AI pick the right expert for each task.",
    minTier: EPlanTier.Business,
  },
  marketplace: {
    label: "Marketplace",
    description: "Publish work as gigs and hire vetted talent.",
    minTier: EPlanTier.Pro,
  },
  ai_roadmap: {
    label: "AI roadmap",
    description: "Personas draft initiatives, milestones and changelogs.",
    minTier: EPlanTier.Pro,
  },
  smart_intake: {
    label: "Smart intake",
    description: "Triage inbound requests into routed work.",
    minTier: EPlanTier.Free,
  },
  workflows: {
    label: "Workflow gates",
    description: "AI approval gates on status transitions.",
    minTier: EPlanTier.Pro,
  },
  automations: {
    label: "Automations",
    description: "Plain-language automations without code.",
    minTier: EPlanTier.Pro,
    quotas: { [EPlanTier.Pro]: 100, [EPlanTier.Business]: null },
  },
  templates: {
    label: "Templates",
    description: "Reusable project and work-item templates.",
    minTier: EPlanTier.Free,
  },
  artifact_publish: {
    label: "Publish artifacts",
    description: "Share skills, design systems and personas.",
    minTier: EPlanTier.Pro,
  },
  teamspaces: {
    label: "Teamspaces",
    description: "Group people and projects with shared roadmaps.",
    minTier: EPlanTier.Pro,
  },
};
