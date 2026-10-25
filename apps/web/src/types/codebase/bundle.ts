import type { ISODateString } from "@/types/common";
import type { ERepoAccess, ERepositoryType } from "./repository";

export enum EBundleStatus {
  Draft = "draft",
  Valid = "valid",
  Invalid = "invalid",
  Archived = "archived",
}

export enum EDependencyType {
  BuildOrder = "build_order",
  Runtime = "runtime",
  Blocking = "blocking",
}

/** One repository's placement inside a bundle version. */
export interface IBundleRepoConfig {
  project_repository_id: string;
  repository_type: ERepositoryType;
  branch: string;
  source_path: string; // "" = repo root
  mount_path: string; // "apps/web"
  access: ERepoAccess;
  required: boolean;
  build_command: string;
  test_command: string;
  execution_order: number;
}

export interface IBundleDependency {
  from_project_repository_id: string;
  to_project_repository_id: string;
  dependency_type: EDependencyType;
  notes: string;
}

export type TValidationCode =
  | "duplicate_repo"
  | "duplicate_mount_path"
  | "nested_mount_path"
  | "invalid_path"
  | "path_traversal"
  | "missing_branch"
  | "dependency_cycle"
  | "self_dependency";

export interface IValidationIssue {
  code: TValidationCode;
  message: string;
  repo_ids: string[];
}

export interface IBundleValidationResult {
  valid: boolean;
  issues: IValidationIssue[];
}

/** An immutable snapshot of a bundle's configuration. Active runs pin their version. */
export interface ISystemBundleVersion {
  id: string;
  bundle_id: string;
  version: number;
  repositories: IBundleRepoConfig[];
  dependencies: IBundleDependency[];
  validation_result: IBundleValidationResult;
  created_at: ISODateString;
}

export interface ISystemBundle {
  id: string;
  project_id: string;
  name: string;
  description: string;
  status: EBundleStatus;
  is_default: boolean;
  current_version: number;
  repository_count: number;
  write_count: number;
  reference_count: number;
  affected_work_item_count: number;
  updated_at: ISODateString;
  created_at: ISODateString;
  /** The current version, embedded for the list/detail views. */
  latest: ISystemBundleVersion;
}

export interface ICreateBundlePayload {
  name: string;
  description: string;
  repositories: IBundleRepoConfig[];
  dependencies: IBundleDependency[];
  save_as_draft: boolean;
}

export type IUpdateBundlePayload = Partial<ICreateBundlePayload>;

export interface IValidateBundlePayload {
  repositories: IBundleRepoConfig[];
  dependencies: IBundleDependency[];
}
