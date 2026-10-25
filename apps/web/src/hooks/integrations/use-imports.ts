import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { importService } from "@/services/integrations/import.service";
import type { ICreateGitHubImportPayload, ICreateImportPayload, IImportFilters } from "@/types";
import { EImportStatus } from "@/types";

import { queryKeys } from "../query-keys";

const PENDING_STATUSES: EImportStatus[] = [
  EImportStatus.Queued,
  EImportStatus.Parsing,
  EImportStatus.Importing,
];

export function useImports(workspaceSlug: string, filters: IImportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.imports(workspaceSlug, filters),
    queryFn: () => importService.getImports(workspaceSlug, filters),
    refetchInterval: (query) => {
      const jobs = query.state.data?.items ?? [];
      return jobs.some((job) => PENDING_STATUSES.includes(job.status)) ? 2000 : false;
    },
  });
}

export function useCreateImport(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateImportPayload) => importService.createImport(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "imports"] });
    },
  });
}

/** Dry-run counts before confirming a GitHub-issues import (GIN-23b) — not
 * enabled until owner+repo are both filled in. */
export function useGitHubImportPreview(
  workspaceSlug: string,
  owner: string,
  repo: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.githubImportPreview(workspaceSlug, owner, repo),
    queryFn: () => importService.previewGitHubImport(workspaceSlug, owner, repo),
    enabled: enabled && Boolean(owner.trim()) && Boolean(repo.trim()),
  });
}

export function useCreateGitHubImport(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateGitHubImportPayload) =>
      importService.createGitHubImport(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "imports"] });
    },
  });
}
