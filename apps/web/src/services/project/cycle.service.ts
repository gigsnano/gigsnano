import type { ICycle, ICycleProgress } from "@/types";
import { ECycleStatus } from "@/types";

import { APIService } from "../api.service";

export interface IUpdateCyclePayload {
  name?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: ECycleStatus;
}

class CycleService extends APIService {
  getCycles(workspaceSlug: string, projectId: string) {
    return this.get<ICycle[]>(`/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`);
  }

  getCycle(workspaceSlug: string, projectId: string, cycleId: string) {
    return this.get<ICycle>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`,
    );
  }

  createCycle(
    workspaceSlug: string,
    projectId: string,
    payload: {
      name: string;
      description?: string;
      start_date?: string | null;
      end_date?: string | null;
    },
  ) {
    return this.post<ICycle>(`/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, payload);
  }

  updateCycle(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    payload: IUpdateCyclePayload,
  ) {
    return this.patch<ICycle>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`,
      payload,
    );
  }

  getCycleProgress(workspaceSlug: string, projectId: string, cycleId: string) {
    return this.get<ICycleProgress>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/progress/`,
    );
  }

  deleteCycle(workspaceSlug: string, projectId: string, cycleId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`,
    );
  }
}

export const cycleService = new CycleService();
