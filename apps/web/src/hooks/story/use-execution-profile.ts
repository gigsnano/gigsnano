"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/hooks/query-keys";
import { executionProfileService } from "@/services/story/execution-profile.service";
import type {
  IOverrideExecutionProfilePayload,
  IResolveExecutionProfilePayload,
} from "@/types/story/execution-profile";

/** Stored execution profile for a work item (GIN-288). `retry: false` so a 404
 * (no profile resolved yet) surfaces immediately instead of retrying — the
 * widget reads that as "not resolved" and offers a resolve action. */
export function useExecutionProfile(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.executionProfile(workspaceSlug, projectId, storyId),
    queryFn: () => executionProfileService.getStored(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
    retry: false,
  });
}

export function useResolveProfile(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const key = queryKeys.executionProfile(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (payload: IResolveExecutionProfilePayload) =>
      executionProfileService.resolve(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useOverrideProfile(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const key = queryKeys.executionProfile(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (payload: IOverrideExecutionProfilePayload) =>
      executionProfileService.override(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

/** Evidence timeline for the latest run (GIN-289). `enabled` when a run id is
 * known — there is no run before any agent work has started. */
export function useSkillEvents(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  runId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.skillEvents(workspaceSlug, projectId, storyId, runId ?? ""),
    queryFn: () => executionProfileService.getSkillEvents(workspaceSlug, projectId, storyId, runId!),
    enabled: Boolean(runId),
  });
}
