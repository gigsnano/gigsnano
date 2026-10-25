import type { IWorkspaceSearchResults } from "@/types";

import { APIService } from "../api.service";

export interface IWorkspaceSearchParams {
  q: string;
  /** "workspace" (default) searches every accessible project; "project" restricts to `projectId`. */
  scope?: "workspace" | "project";
  projectId?: string;
}

class WorkspaceSearchService extends APIService {
  search(workspaceSlug: string, { q, scope, projectId }: IWorkspaceSearchParams) {
    const query = new URLSearchParams({ q });
    if (scope) query.set("scope", scope);
    if (projectId) query.set("project_id", projectId);
    return this.get<IWorkspaceSearchResults>(
      `/workspaces/${workspaceSlug}/search/?${query.toString()}`,
    );
  }
}

export const workspaceSearchService = new WorkspaceSearchService();
