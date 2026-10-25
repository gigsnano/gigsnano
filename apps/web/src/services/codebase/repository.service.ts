import type {
  IBulkConnectPayload,
  IConnectResult,
  IProjectRepository,
  IUpdateRepositoryPayload,
} from "@/types";

import { APIService } from "../api.service";

class RepositoryService extends APIService {
  private base(slug: string, projectId: string) {
    return `/workspaces/${slug}/projects/${projectId}/repositories`;
  }

  listRepositories(slug: string, projectId: string) {
    return this.get<IProjectRepository[]>(`${this.base(slug, projectId)}/`);
  }

  /** Connect one or many; returns a per-repo result so a single failure never rolls back the batch. */
  bulkConnect(slug: string, projectId: string, payload: IBulkConnectPayload) {
    return this.post<IConnectResult[]>(`${this.base(slug, projectId)}/`, payload);
  }

  updateRepository(
    slug: string,
    projectId: string,
    repoId: string,
    payload: IUpdateRepositoryPayload,
  ) {
    return this.patch<IProjectRepository>(`${this.base(slug, projectId)}/${repoId}/`, payload);
  }

  /** Disconnect = soft archive. */
  archiveRepository(slug: string, projectId: string, repoId: string) {
    return this.delete<{ success: boolean }>(`${this.base(slug, projectId)}/${repoId}/`);
  }

  refreshRepository(slug: string, projectId: string, repoId: string) {
    return this.post<IProjectRepository>(`${this.base(slug, projectId)}/${repoId}/refresh/`);
  }
}

export const repositoryService = new RepositoryService();
