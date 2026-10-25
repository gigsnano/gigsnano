import type { ICreateWorkflowRulePayload, IWorkflowRule } from "@/types";

import { APIService } from "../api.service";

class WorkflowService extends APIService {
  getRules(workspaceSlug: string, projectId: string) {
    return this.get<IWorkflowRule[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/`,
    );
  }

  createRule(workspaceSlug: string, projectId: string, payload: ICreateWorkflowRulePayload) {
    return this.post<IWorkflowRule>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/`,
      payload,
    );
  }

  deleteRule(workspaceSlug: string, projectId: string, ruleId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/`,
    );
  }
}

export const workflowService = new WorkflowService();
