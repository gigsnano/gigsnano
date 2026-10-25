import type {
  ICreateDelegationPayload,
  IDelegation,
  ILaunchStoryPayload,
  ILaunchStoryResponse,
} from "@/types/ai/agent-delegation";

import { APIService } from "../api.service";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

class AgentDelegationService extends APIService {
  create(slug: string, projectId: string, storyId: string, payload: ICreateDelegationPayload) {
    return this.post<IDelegation>(
      `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/delegations/`,
      payload,
    );
  }
  /** "Accept & run": apply the stored Execution Profile + delegate (GIN-342). */
  launch(slug: string, projectId: string, storyId: string, payload: ILaunchStoryPayload) {
    return this.post<ILaunchStoryResponse>(
      `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/launch/`,
      payload,
    );
  }
  getDelegation(slug: string, projectId: string, id: string) {
    return this.request<IDelegation>(
      "GET",
      `/workspaces/${slug}/projects/${projectId}/delegations/${id}/`,
    );
  }
  cancel(slug: string, projectId: string, id: string) {
    return this.post<IDelegation>(
      `/workspaces/${slug}/projects/${projectId}/delegations/${id}/cancel/`,
    );
  }
  retry(slug: string, projectId: string, id: string) {
    return this.post<IDelegation>(
      `/workspaces/${slug}/projects/${projectId}/delegations/${id}/retry/`,
    );
  }
  /** Real-backend SSE endpoint (absolute URL for EventSource-style consumption). */
  streamUrl(slug: string, projectId: string, id: string) {
    return `${BASE_URL}/workspaces/${slug}/projects/${projectId}/delegations/${id}/stream/`;
  }
}

export const agentDelegationService = new AgentDelegationService();
