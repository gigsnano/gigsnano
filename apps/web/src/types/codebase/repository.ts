import type { ISODateString } from "@/types/common";

/** What a connected repository represents in the product. V1 is user-assigned;
 *  later discovery can suggest a type without changing the model (GIN-408). */
export enum ERepositoryType {
  Application = "application",
  Service = "service",
  Library = "library",
  Infrastructure = "infrastructure",
  Configuration = "configuration",
  Documentation = "documentation",
  Other = "other",
}

/** Default agent access for a repo. Write = worktree/branch/commit/PR; Reference = read-only. */
export enum ERepoAccess {
  Write = "write",
  Reference = "reference",
}

/** Rolled-up per-repo health for the table. Rendered icon + text (never colour alone). */
export enum ERepoHealth {
  Ready = "ready",
  Behind = "behind",
  Syncing = "syncing",
  Error = "error",
}

/** A Git source connected to a project. Replaces the singular Project→repo fields. */
export interface IProjectRepository {
  id: string;
  project_id: string;
  provider: string; // "github"
  external_repository_id: string;
  full_name: string; // "acme/web"
  display_name: string;
  repository_type: ERepositoryType;
  default_branch: string;
  is_primary: boolean;
  default_access: ERepoAccess;
  health: ERepoHealth;
  clone_status: "none" | "pending" | "cloning" | "ready" | "failed";
  sync_status: "none" | "pending" | "syncing" | "ready" | "failed";
  index_status: "none" | "pending" | "indexing" | "ready" | "failed";
  indexed_commit_sha: string | null;
  indexed_at: ISODateString | null;
  /** Bundles that reference this repo (denormalized) — drives the disconnect-impact warning. */
  bundle_ids: string[];
  created_at: ISODateString;
  updated_at: ISODateString;
  archived_at: ISODateString | null;
}

export interface IConnectRepositoryInput {
  external_repository_id: string;
  full_name: string;
  default_branch: string;
  repository_type?: ERepositoryType;
  default_access?: ERepoAccess;
}

export interface IBulkConnectPayload {
  repositories: IConnectRepositoryInput[];
}

/** Per-repo outcome so one failure never rolls back the batch (spec API expectation). */
export interface IConnectResult {
  full_name: string;
  ok: boolean;
  repository?: IProjectRepository;
  error?: string;
}

export interface IUpdateRepositoryPayload {
  display_name?: string;
  repository_type?: ERepositoryType;
  default_access?: ERepoAccess;
  default_branch?: string;
  is_primary?: boolean;
}
