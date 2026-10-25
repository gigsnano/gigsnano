import type { ICreateViewPayload, IProjectView, IUpdateViewPayload } from "@/types";

import { APIService } from "../api.service";

class ViewService extends APIService {
  getViews(workspaceSlug: string, projectId: string) {
    return this.get<IProjectView[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/views/`,
    );
  }

  createView(workspaceSlug: string, projectId: string, payload: ICreateViewPayload) {
    return this.post<IProjectView>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/views/`,
      payload,
    );
  }

  updateView(
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    payload: IUpdateViewPayload,
  ) {
    return this.patch<IProjectView>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/`,
      payload,
    );
  }

  deleteView(workspaceSlug: string, projectId: string, viewId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/`,
    );
  }

  toggleViewFavorite(workspaceSlug: string, projectId: string, viewId: string) {
    return this.post<IProjectView>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/favorite/`,
      {},
    );
  }
}

export const viewService = new ViewService();
