import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { viewService } from "@/services/project/view.service";
import type { ICreateViewPayload, IUpdateViewPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useProjectViews(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.views(workspaceSlug, projectId),
    queryFn: () => viewService.getViews(workspaceSlug, projectId),
    // Don't fire until we have both ids — mirrors useCycles/useModules.
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useCreateView(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateViewPayload) =>
      viewService.createView(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.views(workspaceSlug, projectId) });
    },
  });
}

export function useUpdateView(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId, payload }: { viewId: string; payload: IUpdateViewPayload }) =>
      viewService.updateView(workspaceSlug, projectId, viewId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.views(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteView(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) => viewService.deleteView(workspaceSlug, projectId, viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.views(workspaceSlug, projectId) });
    },
  });
}

export function useToggleViewFavorite(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      viewService.toggleViewFavorite(workspaceSlug, projectId, viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.views(workspaceSlug, projectId) });
    },
  });
}
