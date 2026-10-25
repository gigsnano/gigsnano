import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notificationService } from "@/services/workspace/notification.service";
import { optimisticById } from "@/hooks/optimistic";
import type { INotificationFilters } from "@/types";

import { queryKeys } from "../query-keys";

function invalidateNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceSlug: string,
) {
  queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
}

export function useNotifications(workspaceSlug: string, filters: INotificationFilters = {}) {
  return useQuery({
    queryKey: queryKeys.notifications(workspaceSlug, filters),
    queryFn: () => notificationService.getNotifications(workspaceSlug, filters),
    // Refresh-based arrival: new notifications appear on focus. Rows are keyed by
    // stable id so a refetch replaces the page without duplicating (GIN-270 AC9).
    refetchOnWindowFocus: true,
  });
}

export function useUnreadNotifications(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.notificationUnread(workspaceSlug),
    queryFn: () => notificationService.getUnreadCount(workspaceSlug),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead(workspaceSlug: string) {
  const queryClient = useQueryClient();
  const root = ["workspaces", workspaceSlug, "notifications"];
  // Optimistically flip the row's read state on click (rollback on error via the
  // shared helper); onSuccess reconciles the row + the unread badge count.
  const optimistic = optimisticById<{ id: string; read: boolean }>(
    queryClient,
    root,
    (v) => v.id,
    (v) => ({ read: v.read }),
  );
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      notificationService.markRead(workspaceSlug, id, read),
    onMutate: optimistic.onMutate,
    onError: optimistic.onError,
    onSuccess: () => {
      invalidateNotificationQueries(queryClient, workspaceSlug);
    },
  });
}

export function useMarkAllNotificationsRead(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllRead(workspaceSlug),
    onSuccess: () => {
      invalidateNotificationQueries(queryClient, workspaceSlug);
    },
  });
}
