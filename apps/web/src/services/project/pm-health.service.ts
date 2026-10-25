import type { ICreatePmHealthUpdate, IPmHealthUpdate } from "@/types";

import { APIService } from "../api.service";

/** PM-reported health updates (GIN-337) — separate from system health. */
class PmHealthService extends APIService {
  private base(workspaceSlug: string, projectId: string) {
    return `/workspaces/${workspaceSlug}/projects/${projectId}/pm-health`;
  }

  getLatest(workspaceSlug: string, projectId: string) {
    return this.get<IPmHealthUpdate | null>(`${this.base(workspaceSlug, projectId)}/latest/`);
  }

  getHistory(workspaceSlug: string, projectId: string) {
    return this.get<IPmHealthUpdate[]>(`${this.base(workspaceSlug, projectId)}/`);
  }

  create(workspaceSlug: string, projectId: string, payload: ICreatePmHealthUpdate) {
    return this.post<IPmHealthUpdate>(`${this.base(workspaceSlug, projectId)}/`, payload);
  }

  retract(workspaceSlug: string, projectId: string, updateId: string) {
    return this.delete<{ success: boolean }>(
      `${this.base(workspaceSlug, projectId)}/${updateId}/`,
    );
  }
}

export const pmHealthService = new PmHealthService();
