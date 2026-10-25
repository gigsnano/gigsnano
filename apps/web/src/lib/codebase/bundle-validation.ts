import type {
  IBundleDependency,
  IBundleRepoConfig,
  IBundleValidationResult,
  IValidationIssue,
} from "@/types";
import { EDependencyType } from "@/types";

/** Lower-case, back-slashes → slashes, collapsed inner slashes, no leading/trailing slash. */
export function normalizeMountPath(p: string): string {
  return p
    .trim()
    .replace(/\\+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .toLowerCase();
}

/** Absolute, drive-letter, or `..` traversal — never allowed as a mount path. */
function isTraversal(p: string): boolean {
  const t = p.trim();
  return /(^|\/)\.\.(\/|$)/.test(t) || t.startsWith("/") || /^[a-z]:/i.test(t);
}

/**
 * Pure client + mock validator for a bundle's repository/dependency config.
 * Mirrors the spec's "Validation and edge cases" list. No I/O, no provider calls.
 */
export function validateBundleConfig(
  repos: IBundleRepoConfig[],
  deps: IBundleDependency[],
): IBundleValidationResult {
  const issues: IValidationIssue[] = [];

  // Duplicate repositories.
  const seen = new Set<string>();
  for (const r of repos) {
    if (seen.has(r.project_repository_id)) {
      issues.push({
        code: "duplicate_repo",
        message: `Repository is selected more than once.`,
        repo_ids: [r.project_repository_id],
      });
    }
    seen.add(r.project_repository_id);
  }

  // Path traversal / invalid absolute path.
  for (const r of repos) {
    if (r.mount_path.trim() && isTraversal(r.mount_path)) {
      issues.push({
        code: "path_traversal",
        message: `Mount path "${r.mount_path}" is not allowed.`,
        repo_ids: [r.project_repository_id],
      });
    }
  }

  // Duplicate + nested mount paths (skip traversal/empty).
  const mounts: { id: string; path: string }[] = [];
  for (const r of repos) {
    if (r.mount_path.trim() && !isTraversal(r.mount_path)) {
      mounts.push({ id: r.project_repository_id, path: normalizeMountPath(r.mount_path) });
    }
  }
  for (let i = 0; i < mounts.length; i++) {
    for (let j = i + 1; j < mounts.length; j++) {
      const a = mounts[i];
      const b = mounts[j];
      if (a.path === b.path) {
        issues.push({
          code: "duplicate_mount_path",
          message: `Mount path "${a.path}" is used by two repositories.`,
          repo_ids: [a.id, b.id],
        });
      } else if (a.path.startsWith(b.path + "/") || b.path.startsWith(a.path + "/")) {
        issues.push({
          code: "nested_mount_path",
          message: `Mount paths "${a.path}" and "${b.path}" are nested.`,
          repo_ids: [a.id, b.id],
        });
      }
    }
  }

  // Self dependency.
  for (const d of deps) {
    if (d.from_project_repository_id === d.to_project_repository_id) {
      issues.push({
        code: "self_dependency",
        message: "A repository cannot depend on itself.",
        repo_ids: [d.from_project_repository_id],
      });
    }
  }

  // Cycle over blocking / build-order edges.
  const ordered = deps.filter(
    (d) =>
      d.from_project_repository_id !== d.to_project_repository_id &&
      (d.dependency_type === EDependencyType.BuildOrder ||
        d.dependency_type === EDependencyType.Blocking),
  );
  if (hasCycle(ordered)) {
    issues.push({
      code: "dependency_cycle",
      message: "Build-order dependencies form a cycle.",
      repo_ids: [],
    });
  }

  return { valid: issues.length === 0, issues };
}

/** Kahn's algorithm — a topological sort that fails to visit every node iff there is a cycle. */
function hasCycle(edges: IBundleDependency[]): boolean {
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const nodes = new Set<string>();

  for (const e of edges) {
    nodes.add(e.from_project_repository_id);
    nodes.add(e.to_project_repository_id);
  }
  for (const n of nodes) indeg.set(n, 0);
  for (const e of edges) {
    const out = adj.get(e.from_project_repository_id) ?? [];
    out.push(e.to_project_repository_id);
    adj.set(e.from_project_repository_id, out);
    indeg.set(e.to_project_repository_id, (indeg.get(e.to_project_repository_id) ?? 0) + 1);
  }

  const queue = [...nodes].filter((n) => (indeg.get(n) ?? 0) === 0);
  let visited = 0;
  while (queue.length) {
    const n = queue.shift()!;
    visited++;
    for (const m of adj.get(n) ?? []) {
      indeg.set(m, (indeg.get(m) ?? 0) - 1);
      if ((indeg.get(m) ?? 0) === 0) queue.push(m);
    }
  }
  return visited !== nodes.size;
}
