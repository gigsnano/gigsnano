import type { ID, ISODateString } from "@/types/common";

export enum EModuleStatus {
  Backlog = "backlog",
  Planned = "planned",
  InProgress = "in_progress",
  Completed = "completed",
}

export interface IModule {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  name: string;
  description: string;
  status: EModuleStatus;
  lead_id: ID | null;
  story_count: number;
  completed_story_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}
