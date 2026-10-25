import type {
  ICreateTeamspacePayload,
  ITeamspace,
  ITeamspaceOverview,
  IUpdateTeamspacePayload,
} from "@/types";

import { APIService } from "../api.service";

class TeamspaceService extends APIService {
  getTeamspaces(workspaceSlug: string) {
    return this.get<ITeamspace[]>(`/workspaces/${workspaceSlug}/teamspaces/`);
  }

  getOverview(workspaceSlug: string, teamspaceId: string) {
    return this.get<ITeamspaceOverview>(
      `/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/overview/`,
    );
  }

  createTeamspace(workspaceSlug: string, payload: ICreateTeamspacePayload) {
    return this.post<ITeamspace>(`/workspaces/${workspaceSlug}/teamspaces/`, payload);
  }

  updateTeamspace(workspaceSlug: string, teamspaceId: string, payload: IUpdateTeamspacePayload) {
    return this.patch<ITeamspace>(
      `/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/`,
      payload,
    );
  }

  deleteTeamspace(workspaceSlug: string, teamspaceId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/`,
    );
  }

  setMembers(workspaceSlug: string, teamspaceId: string, ids: string[]) {
    return this.put<ITeamspace>(
      `/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/members/`,
      { ids },
    );
  }

  setProjects(workspaceSlug: string, teamspaceId: string, ids: string[]) {
    return this.put<ITeamspace>(
      `/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/projects/`,
      { ids },
    );
  }
}

export const teamspaceService = new TeamspaceService();
