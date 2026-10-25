import type { IAgent, ICapabilityBundle, ICreateAgentPayload, TUpdateAgentPayload } from "@/types";

import { APIService } from "../api.service";

class AgentService extends APIService {
  async listAgents(workspaceSlug: string): Promise<IAgent[]> {
    return this.get(`/workspaces/${workspaceSlug}/agents/`);
  }

  async listBundles(workspaceSlug: string): Promise<ICapabilityBundle[]> {
    return this.get(`/workspaces/${workspaceSlug}/agents/bundles/`);
  }

  async createAgent(workspaceSlug: string, payload: ICreateAgentPayload): Promise<IAgent> {
    return this.post(`/workspaces/${workspaceSlug}/agents/`, payload);
  }

  async updateAgent(
    workspaceSlug: string,
    agentId: string,
    payload: TUpdateAgentPayload,
  ): Promise<IAgent> {
    return this.patch(`/workspaces/${workspaceSlug}/agents/${agentId}/`, payload);
  }

  async deleteAgent(workspaceSlug: string, agentId: string): Promise<void> {
    return this.delete(`/workspaces/${workspaceSlug}/agents/${agentId}/`);
  }
}

export const agentService = new AgentService();
