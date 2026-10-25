import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { teamspaceService } from "@/services/teamspace/teamspace.service";
import type { ICreateTeamspacePayload, IUpdateTeamspacePayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useTeamspaces(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.teamspaces(workspaceSlug),
    queryFn: () => teamspaceService.getTeamspaces(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

export function useTeamspaceOverview(workspaceSlug: string, teamspaceId: string) {
  return useQuery({
    queryKey: queryKeys.teamspaceOverview(workspaceSlug, teamspaceId),
    queryFn: () => teamspaceService.getOverview(workspaceSlug, teamspaceId),
    enabled: Boolean(workspaceSlug && teamspaceId),
  });
}

export function useCreateTeamspace(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateTeamspacePayload) =>
      teamspaceService.createTeamspace(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamspaces(workspaceSlug) });
    },
  });
}

export function useUpdateTeamspace(workspaceSlug: string, teamspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateTeamspacePayload) =>
      teamspaceService.updateTeamspace(workspaceSlug, teamspaceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamspaces(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.teamspaceOverview(workspaceSlug, teamspaceId),
      });
    },
  });
}

export function useDeleteTeamspace(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamspaceId: string) => teamspaceService.deleteTeamspace(workspaceSlug, teamspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamspaces(workspaceSlug) });
    },
  });
}

/** Set members + projects together (create dialog / manage). */
export function useSetTeamspaceContents(workspaceSlug: string, teamspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberIds, projectIds }: { memberIds: string[]; projectIds: string[] }) => {
      await teamspaceService.setMembers(workspaceSlug, teamspaceId, memberIds);
      return teamspaceService.setProjects(workspaceSlug, teamspaceId, projectIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamspaces(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.teamspaceOverview(workspaceSlug, teamspaceId),
      });
    },
  });
}
