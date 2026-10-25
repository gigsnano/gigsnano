import type { ISODateString } from "@/types/common";

export enum ECiState {
  None = "none",
  Pending = "pending",
  Passed = "passed",
  Failed = "failed",
}

export enum EReviewState {
  None = "none",
  Pending = "pending",
  Approved = "approved",
  ChangesRequested = "changes_requested",
}

export enum EMergeState {
  Pending = "pending",
  Ready = "ready",
  Merged = "merged",
  Blocked = "blocked",
}

/** Overall Delivery Bundle state (computed server-side from the per-repo rows). */
export type TDeliveryState =
  | "scope_proposed"
  | "in_development"
  | "partially_ready"
  | "ready_to_merge"
  | "partially_merged"
  | "released"
  | "rollback_required"
  | "cancelled";

export interface IDeliveryRepo {
  project_repository_id: string;
  display_name: string;
  base_branch: string;
  head_branch: string;
  commit_count: number;
  pr_url: string;
  pr_id: string;
  required: boolean;
  ci_state: ECiState;
  review_state: EReviewState;
  merge_order: number;
  merge_state: EMergeState;
  no_change: boolean;
  change_summary: string;
  deployment_impact: string;
}

export interface IDeliveryBundle {
  id: string;
  work_item_id: string;
  branch_name: string;
  overall_state: TDeliveryState;
  cancelled: boolean;
  rollback_required: boolean;
  repositories: IDeliveryRepo[];
  /** Required repos not yet merged — these block work-item Done. */
  blocking_repo_ids: string[];
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface IUpdateDeliveryRepoPayload {
  head_branch?: string;
  commit_count?: number;
  pr_url?: string;
  pr_id?: string;
  required?: boolean;
  ci_state?: ECiState;
  review_state?: EReviewState;
  merge_order?: number;
  merge_state?: EMergeState;
  no_change?: boolean;
  change_summary?: string;
  deployment_impact?: string;
}
