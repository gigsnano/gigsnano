import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { stickyService } from "@/services/workspace/sticky.service";
import type { ICreateStickyPayload, IUpdateStickyPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useStickies(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.stickies(workspaceSlug),
    queryFn: () => stickyService.getStickies(workspaceSlug),
  });
}

export function useCreateSticky(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateStickyPayload) =>
      stickyService.createSticky(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stickies(workspaceSlug) });
    },
  });
}

export function useUpdateSticky(workspaceSlug: string, stickyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateStickyPayload) =>
      stickyService.updateSticky(workspaceSlug, stickyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stickies(workspaceSlug) });
    },
  });
}

export function useDeleteSticky(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stickyId: string) => stickyService.deleteSticky(workspaceSlug, stickyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stickies(workspaceSlug) });
    },
  });
}
