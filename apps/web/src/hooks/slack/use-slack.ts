import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { slackService } from "@/services/integrations/slack.service";
import type { IUpdateSlackConfigPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useSlackStatus(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.slack(workspaceSlug),
    queryFn: () => slackService.getStatus(workspaceSlug),
  });
}

export function useSlackInstallUrl() {
  return useMutation({
    mutationFn: (slug: string) => slackService.getInstallUrl(slug),
  });
}

export function useCompleteSlackOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { slug: string; code: string; state: string }) =>
      slackService.completeOAuth(vars.slug, vars.code, vars.state),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.slack(vars.slug) });
    },
  });
}

export function useSlackChannels(workspaceSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.slackChannels(workspaceSlug),
    queryFn: () => slackService.getChannels(workspaceSlug),
    enabled: Boolean(workspaceSlug) && enabled,
  });
}

export function useUpdateSlackConfig(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateSlackConfigPayload) =>
      slackService.updateConfig(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.slack(workspaceSlug) });
    },
  });
}

export function useDisconnectSlack(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => slackService.disconnect(workspaceSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.slack(workspaceSlug) });
    },
  });
}
