import { normalizeMountPath } from "@/lib/codebase/bundle-validation";
import {
  EDependencyType,
  ERepoAccess,
  type IBundleDependency,
  type IBundleRepoConfig,
  type IProjectRepository,
} from "@/types";

/** A dependency plus a stable client key, so editing/removing rows keeps input focus. */
export interface IWizardDep extends IBundleDependency {
  key: string;
}

export interface IWizardState {
  name: string;
  description: string;
  repos: IBundleRepoConfig[];
  deps: IWizardDep[];
}

export function makeDep(from: string, to: string): IWizardDep {
  return {
    key: crypto.randomUUID(),
    from_project_repository_id: from,
    to_project_repository_id: to,
    dependency_type: EDependencyType.BuildOrder,
    notes: "",
  };
}

/** Auto-suggest a mount path from the repo name; the user always reviews it (spec). */
export function suggestMountPath(displayName: string): string {
  return normalizeMountPath(displayName).replace(/[^a-z0-9/-]/g, "-");
}

export function makeRepoConfig(repo: IProjectRepository, order: number): IBundleRepoConfig {
  return {
    project_repository_id: repo.id,
    repository_type: repo.repository_type,
    branch: repo.default_branch,
    source_path: "",
    mount_path: suggestMountPath(repo.display_name),
    access: repo.default_access,
    required: repo.default_access === ERepoAccess.Write,
    build_command: "",
    test_command: "",
    execution_order: order,
  };
}
