import type {
  ICreateProjectPayload,
  IProject,
  ISyncJob,
  ITransferProjectPayload,
  ITransferRequest,
  IWorkspaceEntry,
  IWorkspaceFile,
} from "@/types";
import { normalizeProject, normalizeProjects } from "@/lib/solutions/container-adapter";

import { APIService } from "../api.service";

class ProjectService extends APIService {
  getProjects(workspaceSlug: string, all = false) {
    const query = all ? "?all=true" : "";
    return this.get<IProject[]>(`/workspaces/${workspaceSlug}/projects/${query}`).then(
      normalizeProjects,
    );
  }

  getProject(workspaceSlug: string, projectId: string) {
    return this.get<IProject>(`/workspaces/${workspaceSlug}/projects/${projectId}/`).then(
      normalizeProject,
    );
  }

  createProject(workspaceSlug: string, payload: ICreateProjectPayload) {
    return this.post<IProject>(`/workspaces/${workspaceSlug}/projects/`, payload).then(
      normalizeProject,
    );
  }

  deleteProject(workspaceSlug: string, projectId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/`,
    );
  }

  /** Request a transfer to another workspace (GitHub-style). The destination
   *  owner is emailed; nothing moves until they accept. 404 if the destination
   *  slug is unknown, 409 on identifier clash or an already-pending transfer,
   *  400 if the destination has no owner. */
  requestTransfer(
    workspaceSlug: string,
    projectId: string,
    payload: ITransferProjectPayload,
  ) {
    return this.post<ITransferRequest>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/transfer/`,
      payload,
    );
  }

  /** The project's current pending transfer (source-side banner), or null. */
  getPendingTransfer(workspaceSlug: string, projectId: string) {
    return this.get<ITransferRequest | null>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/transfer/`,
    );
  }

  /** Cancel the pending transfer (source admin). */
  cancelTransfer(workspaceSlug: string, projectId: string) {
    return this.delete<void>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/transfer/`,
    );
  }

  /** Load a transfer request by token (destination owner's accept page). */
  getTransferRequest(token: string) {
    return this.get<ITransferRequest>(`/auth/transfer-requests/${token}/`);
  }

  /** Accept a transfer — the project moves into the destination workspace. */
  acceptTransfer(token: string) {
    return this.post<IProject>(`/auth/transfer-requests/${token}/accept/`);
  }

  /** Decline a transfer — nothing moves. */
  declineTransfer(token: string) {
    return this.post<{ status: string }>(`/auth/transfer-requests/${token}/decline/`);
  }

  /** Flat listing of the project's real workspace files (cloned repo + BMAD docs). */
  getWorkspaceTree(workspaceSlug: string, projectId: string) {
    return this.get<IWorkspaceEntry[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/workspace/tree/`,
    );
  }

  /** Contents of a single workspace file, by POSIX-relative path. */
  getWorkspaceFile(workspaceSlug: string, projectId: string, path: string) {
    return this.get<IWorkspaceFile>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/workspace/file/?path=${encodeURIComponent(path)}`,
    );
  }

  /** Kick off a GitHub doc-sync. 409 if the project has no linked repo. */
  syncProject(workspaceSlug: string, projectId: string) {
    return this.post<ISyncJob>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/sync/`,
    );
  }

  /** Poll a sync job's status. */
  getSyncJob(workspaceSlug: string, projectId: string, jobId: string) {
    return this.get<ISyncJob>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/sync/${jobId}/`,
    );
  }
}

export const projectService = new ProjectService();
