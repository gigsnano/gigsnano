import type { IRosterArtifact } from "@/types";

/** Mock teamspace row — carries `workspace_slug` for handler filtering (not part
 * of the wire TeamspaceOut, harmless extra field on clone). */
export interface IMockTeamspace {
  id: string;
  workspace_slug: string;
  workspace_id: string;
  name: string;
  description: string;
  pinned_artifacts: string[];
  member_ids: string[];
  project_ids: string[];
  created_at: string;
}

export const teamspaces: IMockTeamspace[] = [
  {
    id: "ts_pay",
    workspace_slug: "acme",
    workspace_id: "ws_1",
    name: "Payments Team",
    description: "Checkout, ledger and payment APIs.",
    pinned_artifacts: ["art_finance_persona", "art_tdd_skill"],
    member_ids: ["u_1", "u_2", "u_3"],
    project_ids: ["prj_mba", "prj_ad"],
    created_at: "2026-07-12T09:00:00Z",
  },
];

/** Pinned-artifact catalog (personas/skills/design systems) for the roster. */
export const rosterArtifacts: Record<string, IRosterArtifact> = {
  art_finance_persona: { id: "art_finance_persona", name: "Finance Expert", kind: "persona" },
  art_tdd_skill: { id: "art_tdd_skill", name: "TDD", kind: "skill" },
  art_next_ds: { id: "art_next_ds", name: "Next-shadcn", kind: "design-system" },
};
