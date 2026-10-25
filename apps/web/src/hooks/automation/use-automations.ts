import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { automationService } from "@/services/automation/automation.service";
import type { ICreateAutomationPayload, IUpdateAutomationPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useAutomations(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.automationRules(workspaceSlug, projectId),
    queryFn: () => automationService.getAutomations(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useAutomationRuns(workspaceSlug: string, projectId: string, ruleId: string) {
  return useQuery({
    queryKey: queryKeys.automationRuns(workspaceSlug, projectId, ruleId),
    queryFn: () => automationService.getRuns(workspaceSlug, projectId, ruleId),
    enabled: Boolean(workspaceSlug && projectId && ruleId),
  });
}

export function usePreviewAutomation(workspaceSlug: string, projectId: string) {
  // eslint-disable-next-line react-doctor/query-mutation-missing-invalidation -- preview compiles NL without persisting; nothing to invalidate.
  return useMutation({
    mutationFn: (text: string) => automationService.preview(workspaceSlug, projectId, text),
  });
}

export function useCreateAutomation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateAutomationPayload) =>
      automationService.createAutomation(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.automationRules(workspaceSlug, projectId),
      });
    },
  });
}

export function useUpdateAutomation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, payload }: { ruleId: string; payload: IUpdateAutomationPayload }) =>
      automationService.updateAutomation(workspaceSlug, projectId, ruleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.automationRules(workspaceSlug, projectId),
      });
    },
  });
}

export function useDeleteAutomation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      automationService.deleteAutomation(workspaceSlug, projectId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.automationRules(workspaceSlug, projectId),
      });
    },
  });
}

export function useDryRunAutomation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => automationService.dryRun(workspaceSlug, projectId, ruleId),
    onSuccess: (_data, ruleId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.automationRuns(workspaceSlug, projectId, ruleId),
      });
    },
  });
}
