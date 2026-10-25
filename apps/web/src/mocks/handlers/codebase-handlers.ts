import { APIError } from "@/services/api-error";
import {
  EBundleStatus,
  ERepoAccess,
  ERepoHealth,
  ERepositoryType,
  type IBulkConnectPayload,
  type IBundleRepoConfig,
  type IConnectResult,
  type ICreateBundlePayload,
  type IProjectRepository,
  type ISystemBundle,
  type IUpdateBundlePayload,
  type IUpdateRepositoryPayload,
  type IValidateBundlePayload,
} from "@/types";
import { validateBundleConfig } from "@/lib/codebase/bundle-validation";

import { codebaseRepositories, systemBundles } from "../data/codebase";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);
const notFound = (what: string): never => {
  throw new APIError(404, `${what} not found`);
};

let repoSeq = codebaseRepositories.length;
let bundleSeq = systemBundles.length;
let scopeSeq = 0;

/** In-memory work-item Code scope store (GIN-413 mock), keyed by story id. */
type StoredScope = {
  id: string;
  work_item_id: string;
  bundle_version_id: string | null;
  status: "draft" | "confirmed";
  branch_pattern: string;
  reason: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  repositories: {
    project_repository_id: string;
    mode: "write" | "reference" | "excluded";
    required_delivery: boolean;
    base_branch: string;
    reason: string;
  }[];
};
const codeScopes = new Map<string, StoredScope>();

const activeRepos = (projectId: string) =>
  codebaseRepositories.filter((r) => r.project_id === projectId && !r.archived_at);

const activeBundles = (projectId: string) =>
  systemBundles.filter((b) => b.project_id === projectId && b.status !== EBundleStatus.Archived);

function repoCounts(repos: IBundleRepoConfig[]) {
  return {
    repository_count: repos.length,
    write_count: repos.filter((r) => r.access === ERepoAccess.Write).length,
    reference_count: repos.filter((r) => r.access === ERepoAccess.Reference).length,
  };
}

/** Keep each repo's denormalized `bundle_ids` honest so the disconnect warning is real. */
function syncRepoBundleIds(projectId: string) {
  for (const repo of codebaseRepositories.filter((r) => r.project_id === projectId)) {
    repo.bundle_ids = activeBundles(projectId)
      .filter((b) => b.latest.repositories.some((c) => c.project_repository_id === repo.id))
      .map((b) => b.id);
  }
}

function bundleStatus(payload: { save_as_draft?: boolean }, valid: boolean): EBundleStatus {
  if (payload.save_as_draft) return EBundleStatus.Draft;
  return valid ? EBundleStatus.Valid : EBundleStatus.Invalid;
}

// ---- Code scope (GIN-413) ----
function defaultBundleFor(projectId: string) {
  return activeBundles(projectId).find((b) => b.is_default) ?? null;
}

/** Derive the bundle-default per-repo modes (bundle Write->Write, Reference->Reference). */
function deriveRepoScopes(projectId: string) {
  const bundle = defaultBundleFor(projectId);
  if (!bundle) return [];
  return bundle.latest.repositories.map((cfg) => {
    const isWrite = cfg.access === ERepoAccess.Write;
    return {
      project_repository_id: cfg.project_repository_id,
      mode: (isWrite ? "write" : "reference") as "write" | "reference" | "excluded",
      required_delivery: Boolean(cfg.required) && isWrite,
      base_branch: cfg.branch,
      reason: "",
    };
  });
}

function buildScopeResponse(projectId: string, storyId: string, stored: StoredScope | undefined) {
  const bundle = defaultBundleFor(projectId);
  const names = new Map(activeRepos(projectId).map((r) => [r.id, r.display_name]));
  const repos = (stored ? stored.repositories : deriveRepoScopes(projectId)).map((r) => ({
    ...r,
    display_name: names.get(r.project_repository_id) ?? "",
  }));
  return {
    id: stored?.id ?? null,
    work_item_id: storyId,
    bundle_id: bundle?.id ?? null,
    bundle_version_id: stored?.bundle_version_id ?? bundle?.latest.id ?? null,
    bundle_version: bundle?.current_version ?? null,
    status: stored?.status ?? "draft",
    branch_pattern: stored?.branch_pattern ?? "feature/{code}-{slug}",
    reason: stored?.reason ?? "",
    confirmed_by: stored?.confirmed_by ?? null,
    confirmed_at: stored?.confirmed_at ?? null,
    repositories: repos,
    has_default_bundle: bundle != null,
    created_at: stored?.created_at ?? null,
    updated_at: stored?.updated_at ?? null,
  };
}

// ---- Delivery Bundle (GIN-414) ----
type StoredDeliveryRepo = {
  project_repository_id: string;
  base_branch: string;
  head_branch: string;
  commit_count: number;
  pr_url: string;
  pr_id: string;
  required: boolean;
  ci_state: string;
  review_state: string;
  merge_order: number;
  merge_state: string;
  no_change: boolean;
  change_summary: string;
  deployment_impact: string;
};
type StoredDelivery = {
  id: string;
  work_item_id: string;
  branch_name: string;
  cancelled: boolean;
  rollback_required: boolean;
  created_at: string;
  updated_at: string;
  repositories: StoredDeliveryRepo[];
};
const deliveries = new Map<string, StoredDelivery>();
let deliverySeq = 0;

const dGating = (repos: StoredDeliveryRepo[]) => repos.filter((r) => r.required && !r.no_change);
const dMerged = (r: StoredDeliveryRepo) => r.merge_state === "merged";
const dReady = (r: StoredDeliveryRepo) =>
  Boolean(r.pr_url) &&
  r.ci_state === "passed" &&
  r.review_state === "approved" &&
  (r.merge_state === "ready" || r.merge_state === "pending");
const dStarted = (r: StoredDeliveryRepo) => Boolean(r.pr_url) || r.commit_count > 0;

function computeDeliveryState(d: StoredDelivery): string {
  if (d.cancelled) return "cancelled";
  if (d.rollback_required) return "rollback_required";
  const g = dGating(d.repositories);
  if (g.length === 0) return d.repositories.some(dMerged) ? "released" : "scope_proposed";
  if (g.every(dMerged)) return "released";
  if (g.some(dMerged)) return "partially_merged";
  if (g.every(dReady)) return "ready_to_merge";
  if (g.some(dReady)) return "partially_ready";
  if (d.repositories.some(dStarted)) return "in_development";
  return "scope_proposed";
}

function buildDeliveryResponse(projectId: string, d: StoredDelivery) {
  const names = new Map(activeRepos(projectId).map((r) => [r.id, r.display_name]));
  return {
    ...d,
    overall_state: computeDeliveryState(d),
    blocking_repo_ids: d.cancelled
      ? []
      : dGating(d.repositories).filter((r) => !dMerged(r)).map((r) => r.project_repository_id),
    repositories: d.repositories.map((r) => ({
      ...r,
      display_name: names.get(r.project_repository_id) ?? "",
    })),
  };
}

export function makeCodebaseHandlers(): Handler[] {
  return [
    // ---- Repositories ----
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/repositories\/$/,
      resolve: ([, , projectId]) => clone(activeRepos(projectId)),
    },
    {
      // Bulk connect — per-repo success/failure, never a batch rollback.
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/repositories\/$/,
      resolve: ([, , projectId], body) => {
        const b = (body ?? { repositories: [] }) as IBulkConnectPayload;
        const now = new Date().toISOString();
        const results: IConnectResult[] = [];
        for (const input of b.repositories) {
          const dup = codebaseRepositories.find(
            (r) =>
              r.project_id === projectId &&
              !r.archived_at &&
              (r.external_repository_id === input.external_repository_id ||
                r.full_name === input.full_name),
          );
          if (dup) {
            // Duplicate reported as unchanged, not a new row (GIN-410 AC).
            results.push({ full_name: input.full_name, ok: true, repository: clone(dup) });
            continue;
          }
          const created: IProjectRepository = {
            id: `repo_${++repoSeq}`,
            project_id: projectId,
            provider: "github",
            external_repository_id: input.external_repository_id,
            full_name: input.full_name,
            display_name: input.full_name.split("/").pop() ?? input.full_name,
            repository_type: input.repository_type ?? ERepositoryType.Service,
            default_branch: input.default_branch,
            is_primary: false,
            default_access: input.default_access ?? ERepoAccess.Reference,
            health: ERepoHealth.Syncing,
            clone_status: "pending",
            sync_status: "pending",
            index_status: "pending",
            indexed_commit_sha: null,
            indexed_at: null,
            bundle_ids: [],
            created_at: now,
            updated_at: now,
            archived_at: null,
          };
          codebaseRepositories.push(created);
          results.push({ full_name: input.full_name, ok: true, repository: clone(created) });
        }
        return results;
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/repositories\/([^/]+)\/$/,
      resolve: ([, , projectId, repoId], body) => {
        const repo = activeRepos(projectId).find((r) => r.id === repoId);
        if (!repo) return notFound(`Repository "${repoId}"`);
        const b = (body ?? {}) as IUpdateRepositoryPayload;
        if (b.display_name !== undefined) repo.display_name = b.display_name.trim();
        if (b.repository_type !== undefined) repo.repository_type = b.repository_type;
        if (b.default_access !== undefined) repo.default_access = b.default_access;
        if (b.default_branch !== undefined) repo.default_branch = b.default_branch.trim();
        if (b.is_primary === true) {
          // At most one active Primary per project.
          for (const r of activeRepos(projectId)) r.is_primary = r.id === repoId;
        }
        repo.updated_at = new Date().toISOString();
        return clone(repo);
      },
    },
    {
      // Disconnect = archive (soft). Frontend shows the impact preview first.
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/repositories\/([^/]+)\/$/,
      resolve: ([, , projectId, repoId]) => {
        const repo = activeRepos(projectId).find((r) => r.id === repoId);
        if (!repo) return notFound(`Repository "${repoId}"`);
        repo.archived_at = new Date().toISOString();
        repo.updated_at = repo.archived_at;
        syncRepoBundleIds(projectId);
        return { success: true };
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/repositories\/([^/]+)\/refresh\/$/,
      resolve: ([, , projectId, repoId]) => {
        const repo = activeRepos(projectId).find((r) => r.id === repoId);
        if (!repo) return notFound(`Repository "${repoId}"`);
        const now = new Date().toISOString();
        repo.health = ERepoHealth.Ready;
        repo.clone_status = "ready";
        repo.sync_status = "ready";
        repo.index_status = "ready";
        repo.indexed_at = now;
        repo.updated_at = now;
        return clone(repo);
      },
    },

    // ---- System Bundles ----
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/$/,
      resolve: ([, , projectId]) => clone(activeBundles(projectId)),
    },
    {
      // Validate a draft without saving. Registered before `{id}/` so "validate" isn't an id.
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/validate\/$/,
      resolve: (_m, body) => {
        const b = (body ?? { repositories: [], dependencies: [] }) as IValidateBundlePayload;
        return validateBundleConfig(b.repositories, b.dependencies);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/$/,
      resolve: ([, , projectId], body) => {
        const b = (body ?? {}) as ICreateBundlePayload;
        if (!b.name?.trim()) throw new APIError(400, "Bundle name is required");
        const now = new Date().toISOString();
        const repos = b.repositories ?? [];
        const deps = b.dependencies ?? [];
        const validation = validateBundleConfig(repos, deps);
        const id = `bundle_${++bundleSeq}`;
        const created: ISystemBundle = {
          id,
          project_id: projectId,
          name: b.name.trim(),
          description: b.description?.trim() ?? "",
          status: bundleStatus(b, validation.valid),
          is_default: false,
          current_version: 1,
          ...repoCounts(repos),
          affected_work_item_count: 0,
          updated_at: now,
          created_at: now,
          latest: {
            id: `${id}_v1`,
            bundle_id: id,
            version: 1,
            repositories: repos,
            dependencies: deps,
            validation_result: validation,
            created_at: now,
          },
        };
        systemBundles.push(created);
        syncRepoBundleIds(projectId);
        return clone(created);
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/([^/]+)\/$/,
      resolve: ([, , projectId, bundleId]) => {
        const bundle = activeBundles(projectId).find((x) => x.id === bundleId);
        if (!bundle) return notFound(`Bundle "${bundleId}"`);
        return clone(bundle);
      },
    },
    {
      // Editing an in-use bundle creates a new immutable version.
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/([^/]+)\/$/,
      resolve: ([, , projectId, bundleId], body) => {
        const bundle = activeBundles(projectId).find((x) => x.id === bundleId);
        if (!bundle) return notFound(`Bundle "${bundleId}"`);
        const b = (body ?? {}) as IUpdateBundlePayload;
        const now = new Date().toISOString();
        if (b.name !== undefined) bundle.name = b.name.trim();
        if (b.description !== undefined) bundle.description = b.description.trim();
        const repos = b.repositories ?? bundle.latest.repositories;
        const deps = b.dependencies ?? bundle.latest.dependencies;
        if (b.repositories !== undefined || b.dependencies !== undefined) {
          const validation = validateBundleConfig(repos, deps);
          bundle.current_version += 1;
          bundle.latest = {
            id: `${bundle.id}_v${bundle.current_version}`,
            bundle_id: bundle.id,
            version: bundle.current_version,
            repositories: repos,
            dependencies: deps,
            validation_result: validation,
            created_at: now,
          };
          Object.assign(bundle, repoCounts(repos));
          bundle.status = bundleStatus(b, validation.valid);
          if (bundle.status !== EBundleStatus.Valid) bundle.is_default = false;
        }
        bundle.updated_at = now;
        syncRepoBundleIds(projectId);
        return clone(bundle);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/([^/]+)\/$/,
      resolve: ([, , projectId, bundleId]) => {
        const bundle = activeBundles(projectId).find((x) => x.id === bundleId);
        if (!bundle) return notFound(`Bundle "${bundleId}"`);
        bundle.status = EBundleStatus.Archived;
        bundle.is_default = false;
        bundle.updated_at = new Date().toISOString();
        syncRepoBundleIds(projectId);
        return { success: true };
      },
    },
    {
      // Only a Valid bundle can become Default (spec).
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/system-bundles\/([^/]+)\/default\/$/,
      resolve: ([, , projectId, bundleId]) => {
        const bundle = activeBundles(projectId).find((x) => x.id === bundleId);
        if (!bundle) return notFound(`Bundle "${bundleId}"`);
        if (bundle.status !== EBundleStatus.Valid) {
          throw new APIError(409, "Only a valid bundle can be set as default");
        }
        for (const other of activeBundles(projectId)) other.is_default = other.id === bundleId;
        bundle.updated_at = new Date().toISOString();
        return clone(bundle);
      },
    },

    // ---- Work-item Code scope (GIN-413) ----
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/code-scope\/$/,
      resolve: ([, , projectId, storyId]) =>
        clone(buildScopeResponse(projectId, storyId, codeScopes.get(storyId))),
    },
    {
      method: "PUT",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/code-scope\/$/,
      resolve: ([, , projectId, storyId], body) => {
        const b = (body ?? {}) as Partial<StoredScope> & {
          repositories?: StoredScope["repositories"];
        };
        const now = new Date().toISOString();
        const existing = codeScopes.get(storyId);
        const bundle = defaultBundleFor(projectId);
        const stored: StoredScope = {
          id: existing?.id ?? `scope_${++scopeSeq}`,
          work_item_id: storyId,
          bundle_version_id: b.bundle_version_id ?? existing?.bundle_version_id ?? bundle?.latest.id ?? null,
          status: "draft", // editing un-confirms
          branch_pattern: b.branch_pattern ?? existing?.branch_pattern ?? "feature/{code}-{slug}",
          reason: b.reason ?? existing?.reason ?? "",
          confirmed_by: null,
          confirmed_at: null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
          repositories: (b.repositories ?? existing?.repositories ?? deriveRepoScopes(projectId)).map((r) => ({
            project_repository_id: r.project_repository_id,
            mode: r.mode,
            required_delivery: Boolean(r.required_delivery),
            base_branch: r.base_branch ?? "main",
            reason: r.reason ?? "",
          })),
        };
        codeScopes.set(storyId, stored);
        return clone(buildScopeResponse(projectId, storyId, stored));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/code-scope\/confirm\/$/,
      resolve: ([, , projectId, storyId]) => {
        const now = new Date().toISOString();
        let stored = codeScopes.get(storyId);
        if (!stored) {
          const bundle = defaultBundleFor(projectId);
          stored = {
            id: `scope_${++scopeSeq}`,
            work_item_id: storyId,
            bundle_version_id: bundle?.latest.id ?? null,
            status: "draft",
            branch_pattern: "feature/{code}-{slug}",
            reason: "",
            confirmed_by: null,
            confirmed_at: null,
            created_at: now,
            updated_at: now,
            repositories: deriveRepoScopes(projectId),
          };
        }
        stored.status = "confirmed";
        stored.confirmed_by = "u_1";
        stored.confirmed_at = now;
        stored.updated_at = now;
        codeScopes.set(storyId, stored);
        return clone(buildScopeResponse(projectId, storyId, stored));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/code-scope\/reset\/$/,
      resolve: ([, , projectId, storyId]) => {
        codeScopes.delete(storyId);
        return clone(buildScopeResponse(projectId, storyId, undefined));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/code-scope\/effective\/$/,
      resolve: ([, , , storyId]) => {
        const stored = codeScopes.get(storyId);
        if (!stored || stored.status !== "confirmed") {
          throw new APIError(409, "Code scope must be confirmed before execution");
        }
        const bucket = (mode: string) =>
          stored.repositories.filter((r) => r.mode === mode).map((r) => r.project_repository_id);
        return {
          work_item_id: storyId,
          bundle_version_id: stored.bundle_version_id,
          branch_pattern: stored.branch_pattern,
          write: bucket("write"),
          reference: bucket("reference"),
          excluded: bucket("excluded"),
          confirmed_at: stored.confirmed_at,
        };
      },
    },

    // ---- Delivery Bundle (GIN-414) ----
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/delivery\/$/,
      resolve: ([, , projectId, storyId]) => {
        const d = deliveries.get(storyId);
        if (!d) throw new APIError(404, "No delivery bundle for this work item");
        return clone(buildDeliveryResponse(projectId, d));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/delivery\/$/,
      resolve: ([, , projectId, storyId]) => {
        const existing = deliveries.get(storyId);
        if (existing) return clone(buildDeliveryResponse(projectId, existing));
        const scope = codeScopes.get(storyId);
        if (!scope || scope.status !== "confirmed") {
          throw new APIError(409, "Code scope must be confirmed before execution");
        }
        const now = new Date().toISOString();
        const branch = scope.branch_pattern
          .replace("{code}", storyId.slice(0, 8))
          .replace("{slug}", "work");
        const writes = scope.repositories.filter((r) => r.mode === "write");
        const d: StoredDelivery = {
          id: `del_${++deliverySeq}`,
          work_item_id: storyId,
          branch_name: branch,
          cancelled: false,
          rollback_required: false,
          created_at: now,
          updated_at: now,
          repositories: writes.map((r, i) => ({
            project_repository_id: r.project_repository_id,
            base_branch: r.base_branch,
            head_branch: branch,
            commit_count: 0,
            pr_url: "",
            pr_id: "",
            required: Boolean(r.required_delivery),
            ci_state: "none",
            review_state: "none",
            merge_order: i,
            merge_state: "pending",
            no_change: false,
            change_summary: "",
            deployment_impact: "",
          })),
        };
        deliveries.set(storyId, d);
        return clone(buildDeliveryResponse(projectId, d));
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/delivery\/repositories\/([^/]+)\/$/,
      resolve: ([, , projectId, storyId, repoId], body) => {
        const d = deliveries.get(storyId);
        if (!d) throw new APIError(404, "No delivery bundle for this work item");
        const row = d.repositories.find((r) => r.project_repository_id === repoId);
        if (!row) throw new APIError(404, "Repository not in this delivery bundle");
        Object.assign(row, body ?? {});
        d.updated_at = new Date().toISOString();
        return clone(buildDeliveryResponse(projectId, d));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/delivery\/cancel\/$/,
      resolve: ([, , projectId, storyId]) => {
        const d = deliveries.get(storyId);
        if (!d) throw new APIError(404, "No delivery bundle for this work item");
        d.cancelled = true;
        d.updated_at = new Date().toISOString();
        return clone(buildDeliveryResponse(projectId, d));
      },
    },
  ];
}
