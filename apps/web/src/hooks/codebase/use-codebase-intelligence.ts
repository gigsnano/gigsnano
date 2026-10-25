"use client";

import { useCodeGraph } from "@/hooks/code/use-code-graph";
import { useCodeMetrics } from "@/hooks/code/use-code-metrics";
import { useIndexStatus } from "@/hooks/code/use-index-status";
import {
  buildRealTree,
  computeRealMetrics,
  computeRealModules,
} from "@/lib/code/real-intelligence";
import { EIndexStatus } from "@/types";
import type { ICodebaseIntelligence, ICodebaseRepoContext } from "@/types/code/intelligence";

/**
 * Assembles the Codebase Intelligence payload from the real index. Nothing here is
 * invented (GIN-154).
 *
 * It used to coalesce per-field into `CODEBASE_INTELLIGENCE_FIXTURE`, so a project that
 * hadn't loaded yet rendered a fixture repo, commit and "Indexed 2d ago" that were
 * indistinguishable from real ones — the fixture commit even shared a 7-char prefix
 * with the live one. Every section is now null until its query resolves, so callers
 * must handle "not loaded" instead of being handed a plausible stand-in.
 */
export function useCodebaseIntelligence(workspaceSlug: string, projectId: string) {
  const index = useIndexStatus(workspaceSlug, projectId);
  const isReady = index.status === EIndexStatus.Ready;
  const graphQ = useCodeGraph(workspaceSlug, projectId, isReady);
  const metricsQ = useCodeMetrics(workspaceSlug, projectId, isReady);

  const project = index.data;
  const m = metricsQ.data ?? null;
  const rg = graphQ.data ?? null;

  // Null until the project loads — the header renders a real pending state instead.
  const repo: ICodebaseRepoContext | null = project
    ? {
        repo: project.repo_full_name?.split("/").pop() ?? project.name,
        branch: project.repo_default_branch,
        commitSha: index.commitSha,
        lastIndexedIso: index.indexedAt,
        githubSynced: project.clone_status === "ready",
      }
    : null;

  const data: ICodebaseIntelligence = {
    repo,
    // All three derive from the code graph, so they share its lifetime.
    metrics: rg ? computeRealMetrics(rg, m) : null,
    tree: rg && repo ? buildRealTree(rg, repo.repo, m) : null,
    modules: rg ? computeRealModules(rg, m) : null,
  };

  return {
    data,
    realGraph: rg,
    realMetrics: m,
    indexStatus: index.status,
    isReady,
    isLoading: isReady && graphQ.isLoading,
    isError: graphQ.isError,
    refetch: graphQ.refetch,
  };
}
