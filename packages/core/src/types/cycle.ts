import type { ID, ISODateString } from "./common";

export enum ECycleStatus {
  Draft = "draft",
  Active = "active",
  Completed = "completed",
}

/** A cycle = a sprint. Sprint-0 (`is_sprint_zero`) holds the BMAD planning stories. */
export interface ICycle {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  name: string;
  description: string;
  status: ECycleStatus;
  is_sprint_zero: boolean;
  start_date: ISODateString | null;
  end_date: ISODateString | null;
  story_count: number;
  completed_story_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export enum ECycleStateGroup {
  Completed = "completed",
  Started = "started",
  Unstarted = "unstarted",
  Backlog = "backlog",
  Cancelled = "cancelled",
}

/** One day on the burn-down x-axis. `pending` is null for days after "today". */
export interface IBurndownPoint {
  date: ISODateString; // YYYY-MM-DD
  scope: number;
  ideal: number;
  pending: number | null;
}

export interface ICycleAssigneeStat {
  user_id: ID;
  completed: number;
  total: number;
}

export interface ICycleProgress {
  cycle_id: ID;
  counts: Record<ECycleStateGroup, number>;
  scope: number;
  completion_pct: number; // 0..100
  /** signed: >0 ahead of ideal ("Leading"), <0 behind, 0 on track. */
  leading_by: number;
  burndown: IBurndownPoint[];
  assignees: ICycleAssigneeStat[];
}
