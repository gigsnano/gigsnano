import type { IProjectActivity } from "@/types";

import { APIService } from "../api.service";

class ProjectActivityService extends APIService {
  getActivity(workspaceSlug: string, projectId: string) {
    return this.get<IProjectActivity[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/activity/`,
    );
  }
}

export const projectActivityService = new ProjectActivityService();
