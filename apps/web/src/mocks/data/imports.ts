import type { IImportJob } from "@/types";
import { EImportStatus } from "@/types";

const TS = "2026-07-08T10:00:00Z";

export const importJobs: IImportJob[] = [
  {
    id: "imp_1",
    workspace_slug: "acme",
    source_format: "csv",
    status: EImportStatus.Completed,
    summary: {
      projects_created: 2,
      stories_created: 18,
      stories_updated: 0,
      cycles_created: 3,
      modules_created: 1,
      labels_created: 5,
      states_created: 6,
      skipped_drafts: 1,
      unmatched_members: ["Jamie Rivera"],
      errors: [],
    },
    created_at: TS,
  },
];
