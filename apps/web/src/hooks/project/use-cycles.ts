import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cycleService } from "@/services/project/cycle.service";
import type { IUpdateCyclePayload } from "@/services/project/cycle.service";
import type { ICycleProgress } from "@/types";

import { queryKeys } from "../query-keys";

export function useCycles(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.cycles(workspaceSlug, projectId),
    queryFn: () => cycleService.getCycles(workspaceSlug, projectId),
    // Don't fire until we have both ids — otherwise the path becomes
    // `/projects//cycles//` and the real API 404s (mocks silently swallowed it).
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useCycle(workspaceSlug: string, projectId: string, cycleId: string) {
  return useQuery({
    queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
    queryFn: () => cycleService.getCycle(workspaceSlug, projectId, cycleId),
    enabled: Boolean(workspaceSlug && projectId && cycleId),
  });
}

export function useCycleProgress(workspaceSlug: string, projectId: string, cycleId: string) {
  return useQuery({
    queryKey: queryKeys.cycleProgress(workspaceSlug, projectId, cycleId),
    queryFn: () => cycleService.getCycleProgress(workspaceSlug, projectId, cycleId),
    enabled: Boolean(workspaceSlug && projectId && cycleId),
  });
}

export function useCreateCycle(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      start_date?: string | null;
      end_date?: string | null;
    }) => cycleService.createCycle(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
    },
  });
}

export function useUpdateCycle(workspaceSlug: string, projectId: string, cycleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateCyclePayload) =>
      cycleService.updateCycle(workspaceSlug, projectId, cycleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId) });
    },
  });
}

export function useDeleteCycle(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) =>
      cycleService.deleteCycle(workspaceSlug, projectId, cycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
    },
  });
}
