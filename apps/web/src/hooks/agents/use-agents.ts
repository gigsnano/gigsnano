import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { agentService } from "@/services/ai/agent.service";
import type { ICreateAgentPayload, TUpdateAgentPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useAgents(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.agents(workspaceSlug),
    queryFn: () => agentService.listAgents(workspaceSlug),
  });
}

export const agentKeys = {
  all: (slug: string) => queryKeys.agents(slug),
  bundles: (slug: string) => [...queryKeys.agents(slug), "bundles"] as const,
};

export function useBundles(workspaceSlug: string) {
  return useQuery({
    queryKey: agentKeys.bundles(workspaceSlug),
    queryFn: () => agentService.listBundles(workspaceSlug),
    enabled: Boolean(workspaceSlug),
    staleTime: 5 * 60_000, // a static catalog; refetching it per mount is noise
  });
}

export function useAgent(workspaceSlug: string, agentId: string) {
  const { data, ...rest } = useAgents(workspaceSlug);
  return { ...rest, data: data?.find((a) => a.id === agentId) };
}

export function useCreateAgent(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateAgentPayload) =>
      agentService.createAgent(workspaceSlug, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceSlug) });
    },
  });
}

export function useUpdateAgent(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, payload }: { agentId: string; payload: TUpdateAgentPayload }) =>
      agentService.updateAgent(workspaceSlug, agentId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceSlug) });
    },
  });
}

export function useDeleteAgent(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => agentService.deleteAgent(workspaceSlug, agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceSlug) });
    },
  });
}
