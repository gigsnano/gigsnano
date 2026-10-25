import type {
  EAgentProvider,
  IAgentConnection,
} from "@/types/ai/agent-delegation";

import { APIService } from "../api.service";

class AgentConnectionService extends APIService {
  list() {
    return this.get<IAgentConnection[]>("/agents/connections/");
  }
  installUrl(provider: EAgentProvider) {
    return this.post<{ url: string }>(
      `/agents/connections/${provider}/install-url/`,
    );
  }
  completeOAuth(code: string, state: string) {
    return this.post<IAgentConnection>("/agents/oauth/callback/", { code, state });
  }
  connectCursorApiKey(apiKey: string) {
    return this.post<IAgentConnection>("/agents/connections/cursor/connect/", {
      api_key: apiKey,
    });
  }
  connectClaudeApiKey(apiKey: string) {
    return this.post<IAgentConnection>("/agents/connections/claude/connect/", {
      api_key: apiKey,
    });
  }
  disconnect(id: string) {
    return this.delete<{ success: true }>(`/agents/connections/${id}/`);
  }
}

export const agentConnectionService = new AgentConnectionService();
