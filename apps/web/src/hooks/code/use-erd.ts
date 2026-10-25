import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { codeGraphService } from "@/services/code/code-graph.service";

import { queryKeys } from "../query-keys";

/** The project's persisted ER schema (`code/er/`). Empty `tables` ⇒ no schema
 * source in the repo; the caller then offers to generate one. Gate on index-ready. */
export function useErSchema(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.codeEr(workspaceSlug, projectId),
    queryFn: () => codeGraphService.getErSchema(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}

/**
 * Analyze the codebase and generate the ER schema on demand (GIN-86). On success
 * primes the `useErSchema` cache so the canvas renders immediately without a
 * refetch. The mutation result also carries the schema so the caller can detect
 * the "no models found" case.
 */
export function useGenerateErSchema(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => codeGraphService.generateErSchema(workspaceSlug, projectId),
    onSuccess: (schema) => {
      queryClient.setQueryData(queryKeys.codeEr(workspaceSlug, projectId), schema);
    },
  });
}

/** Resolve a chat `gigs:erd` dbml-only block into a schema via the backend
 * parser. Cached by the block's dbml so a re-render doesn't re-POST. */
export function useParseDbml(
  workspaceSlug: string,
  projectId: string,
  dbml: string,
  id: string,
) {
  return useQuery({
    queryKey: queryKeys.parseDbml(workspaceSlug, projectId, dbml),
    queryFn: () => codeGraphService.parseDbml(workspaceSlug, projectId, dbml, id),
    enabled: Boolean(workspaceSlug && projectId && dbml),
    staleTime: Infinity, // pure function of dbml text — never goes stale
  });
}
