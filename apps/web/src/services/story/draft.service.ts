import type { IUpsertDraftPayload, IWorkItemDraftRecord } from "@/types";

import { APIService } from "../api.service";

class DraftService extends APIService {
  getDrafts(workspaceSlug: string) {
    return this.get<IWorkItemDraftRecord[]>(`/workspaces/${workspaceSlug}/drafts/`);
  }

  createDraft(workspaceSlug: string, projectId: string, payload: IUpsertDraftPayload) {
    return this.post<IWorkItemDraftRecord>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/drafts/`, payload,
    );
  }

  updateDraft(workspaceSlug: string, draftId: string, payload: IUpsertDraftPayload) {
    return this.patch<IWorkItemDraftRecord>(
      `/workspaces/${workspaceSlug}/drafts/${draftId}/`, payload,
    );
  }

  deleteDraft(workspaceSlug: string, draftId: string) {
    return this.delete<{ success: boolean }>(`/workspaces/${workspaceSlug}/drafts/${draftId}/`);
  }
}

export const draftService = new DraftService();
