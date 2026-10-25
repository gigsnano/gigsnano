import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deliveryService } from "@/services/codebase/delivery.service";
import type { IUpdateDeliveryRepoPayload } from "@/types";

import { queryKeys } from "../query-keys";

/** The work item's Delivery Bundle. `retry: false` so a 404 (none yet) resolves fast. */
export function useDelivery(slug: string, projectId: string, storyId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.delivery(slug, projectId, storyId),
    queryFn: () => deliveryService.getDelivery(slug, projectId, storyId),
    enabled: Boolean(slug && projectId && storyId) && enabled,
    retry: false,
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  projectId: string,
  storyId: string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.delivery(slug, projectId, storyId) });
}

export function useCreateDelivery(slug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deliveryService.createDelivery(slug, projectId, storyId),
    onSuccess: () => invalidate(queryClient, slug, projectId, storyId),
  });
}

export function useUpdateDeliveryRepo(slug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, payload }: { repoId: string; payload: IUpdateDeliveryRepoPayload }) =>
      deliveryService.updateRepo(slug, projectId, storyId, repoId, payload),
    onSuccess: () => invalidate(queryClient, slug, projectId, storyId),
  });
}

export function useCancelDelivery(slug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deliveryService.cancelDelivery(slug, projectId, storyId),
    onSuccess: () => invalidate(queryClient, slug, projectId, storyId),
  });
}
