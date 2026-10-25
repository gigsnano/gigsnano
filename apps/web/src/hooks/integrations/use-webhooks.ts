import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { webhookService } from "@/services/integrations/webhook.service";
import type { ICreateWebhookPayload, IUpdateWebhookPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useWebhooks(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.webhooks(workspaceSlug),
    queryFn: () => webhookService.getWebhooks(workspaceSlug),
  });
}

export function useWebhook(workspaceSlug: string, webhookId: string) {
  return useQuery({
    queryKey: queryKeys.webhook(workspaceSlug, webhookId),
    queryFn: () => webhookService.getWebhook(workspaceSlug, webhookId),
    enabled: Boolean(webhookId),
  });
}

export function useCreateWebhook(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateWebhookPayload) =>
      webhookService.createWebhook(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(workspaceSlug) });
    },
  });
}

export function useUpdateWebhook(workspaceSlug: string, webhookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateWebhookPayload) =>
      webhookService.updateWebhook(workspaceSlug, webhookId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhook(workspaceSlug, webhookId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(workspaceSlug) });
    },
  });
}

export function useDeleteWebhook(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) => webhookService.deleteWebhook(workspaceSlug, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(workspaceSlug) });
    },
  });
}

export function useTestWebhook(workspaceSlug: string, webhookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webhookService.testWebhook(workspaceSlug, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhook(workspaceSlug, webhookId) });
    },
  });
}
