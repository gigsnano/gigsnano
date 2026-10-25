import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { projectMemberService } from "@/services/project/project-member.service";
import type { IAddMemberPayload } from "@/services/workspace/workspace.service";
import type { ID, EProjectRole } from "@/types";

import { queryKeys } from "../query-keys";
import { optimisticById } from "../optimistic";

export function useProjectMembers(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectMembers(workspaceSlug, projectId),
    queryFn: () => projectMemberService.getProjectMembers(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useAddProjectMember(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAddMemberPayload) =>
      projectMemberService.addProjectMember(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
    },
  });
}

export function useUpdateProjectMember(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: ID; role: EProjectRole }) =>
      projectMemberService.updateProjectMember(workspaceSlug, projectId, memberId, role),
    ...optimisticById(
      queryClient,
      queryKeys.projectMembers(workspaceSlug, projectId),
      (v: { memberId: ID; role: EProjectRole }) => v.memberId,
      (v) => ({ role: v.role }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
    },
  });
}

export function useRemoveProjectMember(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: ID) =>
      projectMemberService.removeProjectMember(workspaceSlug, projectId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
    },
  });
}

/** Transfer project ownership to another active member (GIN-318). */
export function useTransferProjectOwnership(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newOwnerUserId: ID) =>
      projectMemberService.transferOwnership(workspaceSlug, projectId, newOwnerUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
    },
  });
}
