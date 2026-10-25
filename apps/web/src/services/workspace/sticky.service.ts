import type { ICreateStickyPayload, ISticky, IUpdateStickyPayload } from "@/types";

import { APIService } from "../api.service";

class StickyService extends APIService {
  getStickies(workspaceSlug: string) {
    return this.get<ISticky[]>(`/workspaces/${workspaceSlug}/stickies/`);
  }

  createSticky(workspaceSlug: string, payload: ICreateStickyPayload) {
    return this.post<ISticky>(`/workspaces/${workspaceSlug}/stickies/`, payload);
  }

  updateSticky(workspaceSlug: string, stickyId: string, payload: IUpdateStickyPayload) {
    return this.patch<ISticky>(`/workspaces/${workspaceSlug}/stickies/${stickyId}/`, payload);
  }

  deleteSticky(workspaceSlug: string, stickyId: string) {
    return this.delete<void>(`/workspaces/${workspaceSlug}/stickies/${stickyId}/`);
  }
}

export const stickyService = new StickyService();
