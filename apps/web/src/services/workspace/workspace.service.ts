import type {
  ID,
  EWorkspaceRole,
  IGitHubRepo,
  IProject,
  IWorkspace,
  IWorkspaceHoliday,
  IWorkspaceMember,
} from "@/types";

import { APIService } from "../api.service";

export interface IAddMemberPayload {
  user_id?: ID;
  email?: string;
}

export interface IGitHubStatus {
  connected: boolean;
  repo_url: string | null;
}

class WorkspaceService extends APIService {
  getWorkspaces() {
    return this.get<IWorkspace[]>(`/workspaces/`);
  }

  getWorkspace(slug: string) {
    return this.get<IWorkspace>(`/workspaces/${slug}/`);
  }

  getMembers(slug: string) {
    return this.get<IWorkspaceMember[]>(`/workspaces/${slug}/members/`);
  }

  getPendingInvites() {
    return this.get<IWorkspaceMember[]>(`/auth/me/pending-invites/`);
  }

  addMember(slug: string, payload: IAddMemberPayload) {
    return this.post<IWorkspaceMember>(`/workspaces/${slug}/members/`, payload);
  }

  updateMember(slug: string, memberId: ID, role: EWorkspaceRole) {
    return this.patch<IWorkspaceMember>(`/workspaces/${slug}/members/${memberId}/`, { role });
  }

  /** Both fields are optional server-side: omitting one leaves it alone. */
  updateWorkspace(
    slug: string,
    payload: { name?: string; holidays?: IWorkspaceHoliday[] },
  ) {
    return this.patch<IWorkspace>(`/workspaces/${slug}/`, payload);
  }

  acceptMember(slug: string, memberId: ID) {
    return this.patch<IWorkspaceMember>(`/workspaces/${slug}/members/${memberId}/`, {
      accept: true,
    });
  }

  /**
   * Accept an emailed invitation without its token — for the invitee who signed
   * up somewhere other than the invite link. The server requires a verified
   * email here, because the token is what otherwise proves they read that inbox.
   */
  acceptPendingInvitation(invitationId: ID) {
    return this.post<{ workspace_slug: string }>(
      `/auth/me/pending-invites/${invitationId}/accept/`,
      {},
    );
  }

  removeMember(slug: string, memberId: ID) {
    return this.delete<{ success: boolean }>(`/workspaces/${slug}/members/${memberId}/`);
  }

  getGitHubStatus(slug: string) {
    return this.get<IGitHubStatus>(`/workspaces/${slug}/github/`);
  }

  connectGitHub(slug: string, repoName?: string) {
    return this.post<IGitHubStatus>(`/workspaces/${slug}/github/connect/`, {
      repo_name: repoName,
    });
  }

  disconnectGitHub(slug: string) {
    return this.post<{ success: boolean }>(`/workspaces/${slug}/github/disconnect/`, {});
  }

  getGitHubRepos(slug: string) {
    return this.get<IGitHubRepo[]>(`/workspaces/${slug}/github/repos/`);
  }

  getGitHubInstallUrl(slug: string) {
    return this.get<{ url: string }>(`/workspaces/${slug}/github/install-url/`);
  }

  completeGitHubOAuth(slug: string, code: string, state: string) {
    return this.post<IGitHubStatus>(`/workspaces/${slug}/github/oauth/callback/`, { code, state });
  }

  retryClone(slug: string, projectId: string) {
    return this.post<{ id: string; clone_status: string }>(
      `/workspaces/${slug}/projects/${projectId}/clone/retry/`,
      {},
    );
  }

  linkGitHubRepo(slug: string, projectId: string, repoFullName: string) {
    return this.post<IProject>(
      `/workspaces/${slug}/projects/${projectId}/link-repo/`,
      { repo_full_name: repoFullName },
    );
  }
}

export const workspaceService = new WorkspaceService();
