import { describe, it, expect } from "vitest";

import { ERepositoryType, ERepoAccess, EDependencyType } from "@/types";
import type { IBundleRepoConfig } from "@/types";

import { validateBundleConfig, normalizeMountPath } from "./bundle-validation";

const repo = (
  id: string,
  mount: string,
  over: Partial<IBundleRepoConfig> = {},
): IBundleRepoConfig => ({
  project_repository_id: id,
  repository_type: ERepositoryType.Service,
  branch: "main",
  source_path: "",
  mount_path: mount,
  access: ERepoAccess.Write,
  required: true,
  build_command: "",
  test_command: "",
  execution_order: 0,
  ...over,
});

const dep = (from: string, to: string) => ({
  from_project_repository_id: from,
  to_project_repository_id: to,
  dependency_type: EDependencyType.BuildOrder,
  notes: "",
});

describe("validateBundleConfig", () => {
  it("passes a clean two-repo bundle", () => {
    const r = validateBundleConfig([repo("a", "apps/web"), repo("b", "services/api")], []);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("flags duplicate repositories", () => {
    const r = validateBundleConfig([repo("a", "apps/web"), repo("a", "services/api")], []);
    expect(r.issues.some((i) => i.code === "duplicate_repo")).toBe(true);
  });

  it("flags duplicate mount paths (normalized)", () => {
    const r = validateBundleConfig([repo("a", "apps/web"), repo("b", "apps/web/")], []);
    expect(r.issues.some((i) => i.code === "duplicate_mount_path")).toBe(true);
  });

  it("flags nested mount paths", () => {
    const r = validateBundleConfig([repo("a", "apps"), repo("b", "apps/web")], []);
    expect(r.issues.some((i) => i.code === "nested_mount_path")).toBe(true);
  });

  it("flags path traversal", () => {
    const r = validateBundleConfig([repo("a", "../secrets")], []);
    expect(r.issues.some((i) => i.code === "path_traversal")).toBe(true);
  });

  it("flags a self dependency", () => {
    const r = validateBundleConfig([repo("a", "apps/web")], [dep("a", "a")]);
    expect(r.issues.some((i) => i.code === "self_dependency")).toBe(true);
  });

  it("flags a dependency cycle", () => {
    const r = validateBundleConfig([repo("a", "x"), repo("b", "y")], [dep("a", "b"), dep("b", "a")]);
    expect(r.issues.some((i) => i.code === "dependency_cycle")).toBe(true);
  });

  it("allows an acyclic dependency chain", () => {
    const r = validateBundleConfig(
      [repo("a", "x"), repo("b", "y"), repo("c", "z")],
      [dep("a", "b"), dep("b", "c")],
    );
    expect(r.valid).toBe(true);
  });

  it("normalizeMountPath strips slashes and lower-cases", () => {
    expect(normalizeMountPath("/Apps/Web/")).toBe("apps/web");
  });
});
