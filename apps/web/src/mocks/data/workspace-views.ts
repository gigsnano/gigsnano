import type { IWorkspaceView } from "@/types";
import { EViewLayout } from "@/types";

const TS = "2026-06-10T10:00:00Z";

export const workspaceViews: IWorkspaceView[] = [
  {
    id: "wv_acme_1",
    workspace_slug: "acme",
    name: "All open work",
    description: "Stories in progress across every project.",
    layout: EViewLayout.List,
    filter_query: "status:in_progress",
    created_at: TS,
    updated_at: TS,
  },
  {
    id: "wv_acme_2",
    workspace_slug: "acme",
    name: "Sprint-0 blockers",
    description: "Projects still in planning.",
    layout: EViewLayout.Table,
    // Was `sprint_zero:incomplete` — a field nothing ever parsed, so this view
    // silently listed every item (GIN-175). There is no sprint-zero filter; the
    // nearest honest thing is the work that's still open.
    filter_query: "status:todo",
    created_at: TS,
    updated_at: TS,
  },
];
