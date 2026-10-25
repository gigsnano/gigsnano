import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { workflowService } from "@/services/workflow/workflow.service";
import type { ICreateWorkflowRulePayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useWorkflowRules(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.workflowRules(workspaceSlug, projectId),
    queryFn: () => workflowService.getRules(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useCreateWorkflowRule(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateWorkflowRulePayload) =>
      workflowService.createRule(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowRules(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteWorkflowRule(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => workflowService.deleteRule(workspaceSlug, projectId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowRules(workspaceSlug, projectId) });
    },
  });
}
