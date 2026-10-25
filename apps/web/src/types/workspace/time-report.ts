import type { ID, ISODateString } from "@/types/common";

/** An enriched time entry for the workspace time reports (GIN-58/59). */
export interface ITimeReportEntry {
  id: ID;
  hours: number;
  note: string;
  created_at: ISODateString;
  user_id: ID | null;
  user_name: string;
  user_avatar_url: string | null;
  story_id: ID;
  story_title: string;
  story_code: string;
  project_id: ID;
  project_name: string;
}

export interface ITimeReportFilters {
  user_id?: string;
  story_id?: string;
}
