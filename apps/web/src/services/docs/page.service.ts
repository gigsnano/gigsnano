import type { ICreatePagePayload, IPage, IPagePresence, IUpdatePagePayload } from "@/types";

import { APIService } from "../api.service";

class PageService extends APIService {
  getPages(workspaceSlug: string, projectId: string) {
    return this.get<IPage[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/pages/`,
    );
  }

  getPage(workspaceSlug: string, projectId: string, pageId: string) {
    return this.get<IPage>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/`,
    );
  }

  createPage(workspaceSlug: string, projectId: string, payload: ICreatePagePayload) {
    return this.post<IPage>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/pages/`,
      payload,
    );
  }

  updatePage(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    payload: IUpdatePagePayload,
  ) {
    return this.patch<IPage>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/`,
      payload,
    );
  }

  deletePage(workspaceSlug: string, projectId: string, pageId: string) {
    return this.delete<void>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/`,
    );
  }

  /** Heartbeat: "I'm here" (+ "I'm editing"); returns the live viewer list. */
  heartbeatPresence(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    editing: boolean,
  ) {
    return this.post<IPagePresence>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/presence/`,
      { editing },
    );
  }
}

export const pageService = new PageService();
