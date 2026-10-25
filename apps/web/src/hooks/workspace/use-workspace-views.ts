import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { workspaceViewService } from "@/services/workspace/workspace-view.service";
import type { ICreateWorkspaceViewPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useWorkspaceViews(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.workspaceViews(workspaceSlug),
    queryFn: () => workspaceViewService.getWorkspaceViews(workspaceSlug),
  });
}

export function useCreateWorkspaceView(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateWorkspaceViewPayload) =>
      workspaceViewService.createWorkspaceView(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceViews(workspaceSlug) });
    },
  });
}

export function useDeleteWorkspaceView(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      workspaceViewService.deleteWorkspaceView(workspaceSlug, viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceViews(workspaceSlug) });
    },
  });
}
