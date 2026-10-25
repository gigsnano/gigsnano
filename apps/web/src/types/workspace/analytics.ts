import type { ID } from "@/types/common";

export interface IWorkspaceAnalytics {
  workspace_slug: string;
  active_projects: number;
  total_projects: number;
  active_cycles: number;
  completed_stories: number;
  total_stories: number;
  sprint_zero_complete: number;
  members_active: number;
  /** Per-project progress for charts. */
  project_progress: {
    project_id: ID;
    project_name: string;
    identifier: string;
    progress_pct: number;
  }[];
  /** Mock sprint velocity (stories completed per cycle). */
  velocity: {
    cycle_name: string;
    project_name: string;
    completed: number;
    committed: number;
  }[];
  active_cycle_details: {
    cycle_id: ID;
    cycle_name: string;
    project_id: ID;
    project_name: string;
    story_count: number;
    completed_story_count: number;
    end_date: string | null;
  }[];
}
