import type { ISODateString } from "@/types/common";

/** How an agent may touch a repo within a work item's Code scope (GIN-413). */
export enum ERepoScopeMode {
  Write = "write",
  Reference = "reference",
  Excluded = "excluded",
}

export enum ECodeScopeStatus {
  Draft = "draft",
  Confirmed = "confirmed",
}

export interface IRepoScope {
  project_repository_id: string;
  mode: ERepoScopeMode;
  required_delivery: boolean;
  base_branch: string;
  reason: string;
  /** Repo display name, resolved server-side; empty when the repo is inaccessible. */
  display_name: string;
}

export interface ICodeScope {
  /** null when this is an unpersisted, bundle-derived default. */
  id: string | null;
  work_item_id: string;
  bundle_id: string | null;
  bundle_version_id: string | null;
  bundle_version: number | null;
  status: ECodeScopeStatus;
  branch_pattern: string;
  reason: string;
  confirmed_by: string | null;
  confirmed_at: ISODateString | null;
  repositories: IRepoScope[];
  has_default_bundle: boolean;
  created_at: ISODateString | null;
  updated_at: ISODateString | null;
}

/** Resolved execution plan for an agent run (only when Confirmed). */
export interface IEffectiveScope {
  work_item_id: string;
  bundle_version_id: string | null;
  branch_pattern: string;
  write: string[];
  reference: string[];
  excluded: string[];
  confirmed_at: ISODateString | null;
}

export interface ISaveRepoScope {
  project_repository_id: string;
  mode: ERepoScopeMode;
  required_delivery?: boolean;
  base_branch?: string;
  reason?: string;
}

export interface ISaveCodeScopePayload {
  bundle_version_id?: string | null;
  branch_pattern?: string;
  reason?: string;
  repositories: ISaveRepoScope[];
}
