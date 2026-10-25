import type {
  ICreateSetupDraftPayload,
  ISetupDraft,
  ISolutionRegistry,
  IUpdateSetupDraftPayload,
} from "@/types";

import { APIService } from "../api.service";

class SolutionService extends APIService {
  /** The workspace's solution registry, already gated by flags + permissions. */
  getSolutions(workspaceSlug: string) {
    return this.get<ISolutionRegistry>(`/workspaces/${workspaceSlug}/solutions/`);
  }

  /** The caller's own unexpired setup drafts, most recently touched first. */
  getSetupDrafts(workspaceSlug: string) {
    return this.get<ISetupDraft[]>(`/workspaces/${workspaceSlug}/setup-drafts/`);
  }

  /** Start a draft. 422 if the solution is unknown or not enabled here. */
  createSetupDraft(workspaceSlug: string, payload: ICreateSetupDraftPayload) {
    return this.post<ISetupDraft>(`/workspaces/${workspaceSlug}/setup-drafts/`, payload);
  }

  /** Autosave a step. 409 when `revision` is stale — resolve, don't overwrite. */
  updateSetupDraft(workspaceSlug: string, draftId: string, payload: IUpdateSetupDraftPayload) {
    return this.patch<ISetupDraft>(
      `/workspaces/${workspaceSlug}/setup-drafts/${draftId}/`,
      payload,
    );
  }

  /** Discard a draft and its temporary uploads, per the retention policy. */
  deleteSetupDraft(workspaceSlug: string, draftId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/setup-drafts/${draftId}/`,
    );
  }
}

export const solutionService = new SolutionService();
