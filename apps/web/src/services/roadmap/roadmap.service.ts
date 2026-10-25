import type {
  ICreateInitiativePayload,
  ICreateReleasePayload,
  IInitiative,
  IInitiativesDraft,
  ILinkStoriesPayload,
  IRelease,
  IRoadmapRollup,
  IUpdateInitiativePayload,
  IUpdateReleasePayload,
} from "@/types";

import { APIService } from "../api.service";

class RoadmapService extends APIService {
  // ---- Initiatives (workspace) ----
  getInitiatives(workspaceSlug: string) {
    return this.get<IInitiative[]>(`/workspaces/${workspaceSlug}/initiatives/`);
  }
  getInitiativeRollup(workspaceSlug: string, initiativeId: string) {
    return this.get<IRoadmapRollup>(
      `/workspaces/${workspaceSlug}/initiatives/${initiativeId}/rollup/`,
    );
  }
  createInitiative(workspaceSlug: string, payload: ICreateInitiativePayload) {
    return this.post<IInitiative>(`/workspaces/${workspaceSlug}/initiatives/`, payload);
  }
  updateInitiative(workspaceSlug: string, initiativeId: string, payload: IUpdateInitiativePayload) {
    return this.patch<IInitiative>(
      `/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`,
      payload,
    );
  }
  deleteInitiative(workspaceSlug: string, initiativeId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`,
    );
  }
  /** Analyst drafts initiatives from a project's brief (not saved). */
  draftInitiatives(workspaceSlug: string, projectId: string, text = "") {
    return this.post<IInitiativesDraft>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/roadmap/draft-initiatives/`,
      { text },
    );
  }

  // ---- Releases (project) ----
  getReleases(workspaceSlug: string, projectId: string) {
    return this.get<IRelease[]>(`/workspaces/${workspaceSlug}/projects/${projectId}/releases/`);
  }
  createRelease(workspaceSlug: string, projectId: string, payload: ICreateReleasePayload) {
    return this.post<IRelease>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/releases/`,
      payload,
    );
  }
  updateRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    payload: IUpdateReleasePayload,
  ) {
    return this.patch<IRelease>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/`,
      payload,
    );
  }
  linkRelease(workspaceSlug: string, projectId: string, releaseId: string, payload: ILinkStoriesPayload) {
    return this.post<IRelease>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/link/`,
      payload,
    );
  }
  generateChangelog(workspaceSlug: string, projectId: string, releaseId: string) {
    return this.post<IRelease>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/changelog/`,
      {},
    );
  }
}

export const roadmapService = new RoadmapService();
