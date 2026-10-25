import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { gigsAiService } from "@/services/ai/gigs-ai.service";
import type {
  ICreateGigsThreadPayload,
  IGigsThreadFilters,
  IUpdateGigsThreadPayload,
} from "@/types/ai/gigs-ai";

import { queryKeys } from "../query-keys";

export function useGigsThreads(
  workspaceSlug: string,
  filters: IGigsThreadFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.gigsAiThreads(workspaceSlug, filters),
    queryFn: () => gigsAiService.listThreads(workspaceSlug, filters),
    enabled: !!workspaceSlug && (options.enabled ?? true),
  });
}

export function useGigsThread(workspaceSlug: string, threadId: string | null) {
  return useQuery({
    queryKey: queryKeys.gigsAiThread(workspaceSlug, threadId ?? ""),
    queryFn: () => gigsAiService.getThread(workspaceSlug, threadId as string),
    enabled: !!workspaceSlug && !!threadId,
  });
}

export function useCreateGigsThread(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateGigsThreadPayload = {}) =>
      gigsAiService.createThread(workspaceSlug, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "gigs-ai", "threads"] }),
  });
}

export function useUpdateGigsThread(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, payload }: { threadId: string; payload: IUpdateGigsThreadPayload }) =>
      gigsAiService.updateThread(workspaceSlug, threadId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "gigs-ai", "threads"] }),
  });
}

function useDeleteGigsThread(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => gigsAiService.deleteThread(workspaceSlug, threadId),
    onSuccess: (_data, threadId) => {
      qc.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "gigs-ai", "threads"] });
      qc.removeQueries({ queryKey: queryKeys.gigsAiThread(workspaceSlug, threadId) });
    },
  });
}
