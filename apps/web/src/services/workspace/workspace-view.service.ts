import type { ICreateWorkspaceViewPayload, IWorkspaceView } from "@/types";

import { APIService } from "../api.service";

class WorkspaceViewService extends APIService {
  getWorkspaceViews(workspaceSlug: string) {
    return this.get<IWorkspaceView[]>(`/workspaces/${workspaceSlug}/workspace-views/`);
  }

  createWorkspaceView(workspaceSlug: string, payload: ICreateWorkspaceViewPayload) {
    return this.post<IWorkspaceView>(`/workspaces/${workspaceSlug}/workspace-views/`, payload);
  }

  deleteWorkspaceView(workspaceSlug: string, viewId: string) {
    return this.delete<void>(`/workspaces/${workspaceSlug}/workspace-views/${viewId}/`);
  }
}

export const workspaceViewService = new WorkspaceViewService();
