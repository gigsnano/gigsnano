import type { IModule } from "@/types";
import { EModuleStatus } from "@/types";

import { APIService } from "../api.service";

export interface IUpdateModulePayload {
  name?: string;
  description?: string;
  status?: EModuleStatus;
}

class ModuleService extends APIService {
  getModules(workspaceSlug: string, projectId: string) {
    return this.get<IModule[]>(`/workspaces/${workspaceSlug}/projects/${projectId}/modules/`);
  }

  getModule(workspaceSlug: string, projectId: string, moduleId: string) {
    return this.get<IModule>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/`,
    );
  }

  createModule(workspaceSlug: string, projectId: string, payload: { name: string; description?: string }) {
    return this.post<IModule>(`/workspaces/${workspaceSlug}/projects/${projectId}/modules/`, payload);
  }

  updateModule(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    payload: IUpdateModulePayload,
  ) {
    return this.patch<IModule>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/`,
      payload,
    );
  }
}

export const moduleService = new ModuleService();
