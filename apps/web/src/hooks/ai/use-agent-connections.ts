import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { agentConnectionService } from "@/services/ai/agent-connection.service";
import type { EAgentProvider } from "@/types/ai/agent-delegation";

import { queryKeys } from "../query-keys";

export function useAgentConnections() {
  return useQuery({
    queryKey: queryKeys.agentConnections,
    queryFn: () => agentConnectionService.list(),
  });
}

export function useConnectAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: EAgentProvider) => {
      const { url } = await agentConnectionService.installUrl(provider);
      window.location.assign(url);
      return { url };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentConnections }),
  });
}

export function useConnectCursorApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => agentConnectionService.connectCursorApiKey(apiKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentConnections }),
  });
}

export function useConnectClaudeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => agentConnectionService.connectClaudeApiKey(apiKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentConnections }),
  });
}

export function useCompleteAgentOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, state }: { code: string; state: string }) =>
      agentConnectionService.completeOAuth(code, state),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentConnections }),
  });
}

export function useDisconnectAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentConnectionService.disconnect(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentConnections }),
  });
}
