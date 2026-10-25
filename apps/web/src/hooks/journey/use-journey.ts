import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { journeyService } from "@/services/journey/journey.service";
import type { IExperienceContract } from "@/lib/journey/experience";
import type { ITopology } from "@/lib/journey/topology";
import type { IDiscovery } from "@/lib/journey/discovery";

import { queryKeys } from "../query-keys";

export function useJourney(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.journey(workspaceSlug, projectId),
    queryFn: () => journeyService.getJourney(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}

export function useDeliveryPlan(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.deliveryPlan(workspaceSlug, projectId),
    queryFn: () => journeyService.getDeliveryPlan(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}

export function useStartDelivery(workspaceSlug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; storyIds: string[] }) =>
      journeyService.startDelivery(workspaceSlug, projectId, input.title, input.storyIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deliveryPlan(workspaceSlug, projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
    },
  });
}

export function useExperienceContract(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.experienceContract(workspaceSlug, projectId),
    queryFn: () => journeyService.getExperienceContract(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
    select: (d) => d.contract,
  });
}

export function useSaveExperienceContract(workspaceSlug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contract: IExperienceContract) =>
      journeyService.saveExperienceContract(workspaceSlug, projectId, contract),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.experienceContract(workspaceSlug, projectId) }),
  });
}

export function useTopology(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.topologyContract(workspaceSlug, projectId),
    queryFn: () => journeyService.getTopology(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
    select: (d) => d.contract,
  });
}

export function useSaveTopology(workspaceSlug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topology: ITopology) =>
      journeyService.saveTopology(workspaceSlug, projectId, topology),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.topologyContract(workspaceSlug, projectId) }),
  });
}

export function useDiscovery(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.discovery(workspaceSlug, projectId),
    queryFn: () => journeyService.getDiscovery(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useSaveDiscovery(workspaceSlug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (discovery: IDiscovery) =>
      journeyService.saveDiscovery(workspaceSlug, projectId, discovery),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.discovery(workspaceSlug, projectId) }),
  });
}
