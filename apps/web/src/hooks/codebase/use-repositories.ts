import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositoryService } from "@/services/codebase/repository.service";
import type { IBulkConnectPayload, IUpdateRepositoryPayload } from "@/types";

import { queryKeys } from "../query-keys";

/** Connected repositories for a project. */
export function useRepositories(slug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.repositories(slug, projectId),
    queryFn: () => repositoryService.listRepositories(slug, projectId),
    enabled: Boolean(slug && projectId),
  });
}

/** Bundle counts depend on repo membership, so repo writes invalidate both lists. */
function invalidateRepoDependents(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.repositories(slug, projectId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.systemBundles(slug, projectId) });
}

export function useBulkConnectRepositories(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IBulkConnectPayload) =>
      repositoryService.bulkConnect(slug, projectId, payload),
    onSuccess: () => invalidateRepoDependents(queryClient, slug, projectId),
  });
}

export function useUpdateRepository(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, payload }: { repoId: string; payload: IUpdateRepositoryPayload }) =>
      repositoryService.updateRepository(slug, projectId, repoId, payload),
    onSuccess: () => invalidateRepoDependents(queryClient, slug, projectId),
  });
}

export function useArchiveRepository(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => repositoryService.archiveRepository(slug, projectId, repoId),
    onSuccess: () => invalidateRepoDependents(queryClient, slug, projectId),
  });
}

export function useRefreshRepository(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => repositoryService.refreshRepository(slug, projectId, repoId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories(slug, projectId) }),
  });
}
