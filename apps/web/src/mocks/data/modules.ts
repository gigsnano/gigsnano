import type { IModule } from "@/types";
import { EModuleStatus } from "@/types";

export const modules: IModule[] = [
  {
    id: "mod_mba_auth",
    workspace_slug: "acme",
    project_id: "prj_mba",
    name: "Authentication",
    description: "Sign-up, sign-in, MFA, and session management.",
    status: EModuleStatus.InProgress,
    lead_id: "u_2",
    story_count: 8,
    completed_story_count: 3,
    created_at: "2026-05-16T09:00:00Z",
    updated_at: "2026-06-28T10:00:00Z",
  },
  {
    id: "mod_mba_payments",
    workspace_slug: "acme",
    project_id: "prj_mba",
    name: "Payments",
    description: "Transfers, scheduled payments, and transaction history.",
    status: EModuleStatus.Planned,
    lead_id: "u_1",
    story_count: 11,
    completed_story_count: 0,
    created_at: "2026-05-18T09:00:00Z",
    updated_at: "2026-06-20T10:00:00Z",
  },
];
