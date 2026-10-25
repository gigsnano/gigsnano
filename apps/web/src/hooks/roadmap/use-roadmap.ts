import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { roadmapService } from "@/services/roadmap/roadmap.service";
import type {
  ICreateInitiativePayload,
  ICreateReleasePayload,
  IUpdateInitiativePayload,
  IUpdateReleasePayload,
} from "@/types";

import { queryKeys } from "../query-keys";

// ---- Initiatives ----
export function useInitiatives(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.initiatives(workspaceSlug),
    queryFn: () => roadmapService.getInitiatives(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

export function useInitiativeRollup(workspaceSlug: string, initiativeId: string) {
  return useQuery({
    queryKey: queryKeys.initiativeRollup(workspaceSlug, initiativeId),
    queryFn: () => roadmapService.getInitiativeRollup(workspaceSlug, initiativeId),
    enabled: Boolean(workspaceSlug && initiativeId),
  });
}

export function useCreateInitiative(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateInitiativePayload) =>
      roadmapService.createInitiative(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.initiatives(workspaceSlug) });
    },
  });
}

export function useUpdateInitiative(workspaceSlug: string, initiativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateInitiativePayload) =>
      roadmapService.updateInitiative(workspaceSlug, initiativeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.initiatives(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.initiativeRollup(workspaceSlug, initiativeId),
      });
    },
  });
}

export function useDeleteInitiative(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (initiativeId: string) =>
      roadmapService.deleteInitiative(workspaceSlug, initiativeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.initiatives(workspaceSlug) });
    },
  });
}

export function useDraftInitiatives(workspaceSlug: string) {
  // eslint-disable-next-line react-doctor/query-mutation-missing-invalidation -- drafts are unsaved suggestions; nothing to invalidate.
  return useMutation({
    mutationFn: (projectId: string) => roadmapService.draftInitiatives(workspaceSlug, projectId),
  });
}

// ---- Releases ----
export function useReleases(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.releases(workspaceSlug, projectId),
    queryFn: () => roadmapService.getReleases(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useCreateRelease(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateReleasePayload) =>
      roadmapService.createRelease(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.releases(workspaceSlug, projectId) });
    },
  });
}

export function useUpdateRelease(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, payload }: { releaseId: string; payload: IUpdateReleasePayload }) =>
      roadmapService.updateRelease(workspaceSlug, projectId, releaseId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.releases(workspaceSlug, projectId) });
    },
  });
}

export function useLinkRelease(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, storyIds }: { releaseId: string; storyIds: string[] }) =>
      roadmapService.linkRelease(workspaceSlug, projectId, releaseId, { story_ids: storyIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.releases(workspaceSlug, projectId) });
    },
  });
}

export function useGenerateChangelog(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: string) =>
      roadmapService.generateChangelog(workspaceSlug, projectId, releaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.releases(workspaceSlug, projectId) });
    },
  });
}
