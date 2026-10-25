import type { IWorkspaceAnalytics } from "@/types";

import { APIService } from "../api.service";

class AnalyticsService extends APIService {
  /** `projectIds` narrows every figure (a dashboard's project filter). */
  getWorkspaceAnalytics(workspaceSlug: string, projectIds?: string[]) {
    const qs = projectIds?.length ? `?project_ids=${projectIds.join(",")}` : "";
    return this.get<IWorkspaceAnalytics>(`/workspaces/${workspaceSlug}/analytics/${qs}`);
  }
}

export const analyticsService = new AnalyticsService();
