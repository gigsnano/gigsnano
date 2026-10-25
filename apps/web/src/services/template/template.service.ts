import type {
  ICreateRecurrencePayload,
  ICreateTemplatePayload,
  IRecurrence,
  ITemplate,
  ITemplateDraft,
  IUpdateTemplatePayload,
} from "@/types";

import { APIService } from "../api.service";

class TemplateService extends APIService {
  // ---- Templates (workspace) ----
  getTemplates(workspaceSlug: string, kind?: string) {
    const q = kind ? `?kind=${kind}` : "";
    return this.get<ITemplate[]>(`/workspaces/${workspaceSlug}/templates/${q}`);
  }
  createTemplate(workspaceSlug: string, payload: ICreateTemplatePayload) {
    return this.post<ITemplate>(`/workspaces/${workspaceSlug}/templates/`, payload);
  }
  updateTemplate(workspaceSlug: string, templateId: string, payload: IUpdateTemplatePayload) {
    return this.patch<ITemplate>(`/workspaces/${workspaceSlug}/templates/${templateId}/`, payload);
  }
  deleteTemplate(workspaceSlug: string, templateId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/templates/${templateId}/`,
    );
  }
  draftTemplate(workspaceSlug: string, text: string) {
    return this.post<ITemplateDraft>(`/workspaces/${workspaceSlug}/templates/draft/`, { text });
  }
  applyTemplate(workspaceSlug: string, projectId: string, templateId: string) {
    return this.post<{ story_id: string }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/templates/${templateId}/apply/`,
      {},
    );
  }

  // ---- Recurrences (project; a recurrence is a schedule automation rule) ----
  getRecurrences(workspaceSlug: string, projectId: string) {
    return this.get<IRecurrence[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/recurrences/`,
    );
  }
  createRecurrence(workspaceSlug: string, projectId: string, payload: ICreateRecurrencePayload) {
    return this.post<IRecurrence>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/recurrences/`,
      payload,
    );
  }
  /** Pause/resume via the underlying automation rule (recurrence id = rule id). */
  setRecurrenceEnabled(workspaceSlug: string, projectId: string, recurrenceId: string, enabled: boolean) {
    return this.patch<unknown>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/automation-rules/${recurrenceId}/`,
      { enabled },
    );
  }
  deleteRecurrence(workspaceSlug: string, projectId: string, recurrenceId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/automation-rules/${recurrenceId}/`,
    );
  }
}

export const templateService = new TemplateService();
