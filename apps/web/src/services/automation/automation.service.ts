import type {
  IAutomationAst,
  IAutomationRule,
  IAutomationRun,
  ICreateAutomationPayload,
  IUpdateAutomationPayload,
} from "@/types";

import { APIService } from "../api.service";

class AutomationService extends APIService {
  private base(workspaceSlug: string, projectId: string) {
    return `/workspaces/${workspaceSlug}/projects/${projectId}/automation-rules`;
  }

  /** Compile NL → AST for review, without saving. */
  preview(workspaceSlug: string, projectId: string, text: string) {
    return this.post<IAutomationAst>(`${this.base(workspaceSlug, projectId)}/preview/`, { text });
  }

  getAutomations(workspaceSlug: string, projectId: string) {
    return this.get<IAutomationRule[]>(`${this.base(workspaceSlug, projectId)}/`);
  }

  createAutomation(workspaceSlug: string, projectId: string, payload: ICreateAutomationPayload) {
    return this.post<IAutomationRule>(`${this.base(workspaceSlug, projectId)}/`, payload);
  }

  updateAutomation(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    payload: IUpdateAutomationPayload,
  ) {
    return this.patch<IAutomationRule>(
      `${this.base(workspaceSlug, projectId)}/${ruleId}/`,
      payload,
    );
  }

  deleteAutomation(workspaceSlug: string, projectId: string, ruleId: string) {
    return this.delete<{ success: boolean }>(
      `${this.base(workspaceSlug, projectId)}/${ruleId}/`,
    );
  }

  dryRun(workspaceSlug: string, projectId: string, ruleId: string) {
    return this.post<IAutomationRun>(
      `${this.base(workspaceSlug, projectId)}/${ruleId}/dry-run/`,
      { event_data: {} },
    );
  }

  getRuns(workspaceSlug: string, projectId: string, ruleId: string) {
    return this.get<IAutomationRun[]>(`${this.base(workspaceSlug, projectId)}/${ruleId}/runs/`);
  }
}

export const automationService = new AutomationService();
