import type { ID, EProjectRole, IProjectMember } from "@/types";

import { APIService } from "../api.service";
import type { IAddMemberPayload } from "../workspace/workspace.service";

class ProjectMemberService extends APIService {
  getProjectMembers(slug: string, projectId: ID) {
    return this.get<IProjectMember[]>(`/workspaces/${slug}/projects/${projectId}/members/`);
  }

  addProjectMember(slug: string, projectId: ID, payload: IAddMemberPayload) {
    return this.post<IProjectMember>(
      `/workspaces/${slug}/projects/${projectId}/members/`,
      payload,
    );
  }

  updateProjectMember(slug: string, projectId: ID, memberId: ID, role: EProjectRole) {
    return this.patch<IProjectMember>(
      `/workspaces/${slug}/projects/${projectId}/members/${memberId}/`,
      { role },
    );
  }

  removeProjectMember(slug: string, projectId: ID, memberId: ID) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${slug}/projects/${projectId}/members/${memberId}/`,
    );
  }

  /** Atomically make another active member the project OWNER (GIN-318). */
  transferOwnership(slug: string, projectId: ID, newOwnerUserId: ID) {
    return this.post<IProjectMember>(
      `/workspaces/${slug}/projects/${projectId}/transfer-ownership/`,
      { new_owner_user_id: newOwnerUserId },
    );
  }
}

export const projectMemberService = new ProjectMemberService();
