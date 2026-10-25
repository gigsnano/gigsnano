import type { ITimeReportEntry, ITimeReportFilters } from "@/types";

import { APIService } from "../api.service";

class TimeTrackingService extends APIService {
  getWorkspaceTimeEntries(workspaceSlug: string, filters: ITimeReportFilters = {}) {
    const qs = new URLSearchParams();
    if (filters.user_id) qs.set("user_id", filters.user_id);
    if (filters.story_id) qs.set("story_id", filters.story_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<ITimeReportEntry[]>(
      `/workspaces/${workspaceSlug}/time-entries/${suffix}`,
    );
  }
}

export const timeTrackingService = new TimeTrackingService();
