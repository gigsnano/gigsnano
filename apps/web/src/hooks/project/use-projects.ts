import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { projectService } from "@/services/project/project.service";
import { cycleService } from "@/services/project/cycle.service";
import type { ICreateProjectPayload, ITransferProjectPayload } from "@/types";
import { ESyncJobStatus } from "@/types";

import { queryKeys } from "../query-keys";

/** List projects in a workspace. `all` (Owner/Admin only, ignored server-side otherwise) returns every project. */
export function useProjects(workspaceSlug: string, all = false) {
  return useQuery({
    // Extra key segment keeps the two variants cached separately; invalidating
    // queryKeys.projects(workspaceSlug) still clears both (prefix match).
    queryKey: [...queryKeys.projects(workspaceSlug), all ? "all" : "mine"],
    queryFn: () => projectService.getProjects(workspaceSlug, all),
  });
}

/** A single project. Disabled when no projectId is present (e.g. on non-project routes). */
export function useProject(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.project(workspaceSlug, projectId),
    queryFn: () => projectService.getProject(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

/** Flat listing of the project's real workspace files (cloned repo + BMAD docs). */
export function useWorkspaceTree(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.workspaceTree(workspaceSlug, projectId),
    queryFn: () => projectService.getWorkspaceTree(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

/** Contents of a single workspace file. Disabled until a path is selected. */
export function useWorkspaceFile(
  workspaceSlug: string,
  projectId: string,
  path: string | null,
) {
  return useQuery({
    queryKey: queryKeys.workspaceFile(workspaceSlug, projectId, path ?? ""),
    queryFn: () => projectService.getWorkspaceFile(workspaceSlug, projectId, path!),
    enabled: Boolean(workspaceSlug && projectId && path),
  });
}

/**
 * Create a project and refresh the list. The backend seeds a Sprint-0 cycle at
 * creation; we resolve it here and return its id so callers can land the user on
 * the standard cycle route (not a bespoke board). Returns `{ project,
 * sprintZeroCycleId }`.
 */
export function useCreateProject(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ICreateProjectPayload) => {
      const project = await projectService.createProject(workspaceSlug, payload);
      const cycles = await cycleService.getCycles(workspaceSlug, project.id);
      // Prime the cache so the destination cycle route renders without a refetch.
      queryClient.setQueryData(queryKeys.cycles(workspaceSlug, project.id), cycles);
      const sprintZero = cycles.find((c) => c.is_sprint_zero) ?? cycles[0] ?? null;
      return { project, sprintZeroCycleId: sprintZero?.id ?? null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
    },
  });
}

/** Kick off a GitHub doc-sync. Resolves to the queued job (poll it with `useSyncJob`). */
export function useSyncProject(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => projectService.syncProject(workspaceSlug, projectId),
    onSuccess: (job) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncJob(workspaceSlug, projectId, job.id),
      });
    },
  });
}

/**
 * Poll a sync job until it reaches a terminal state. Disabled until `jobId` is
 * set; refetches every ~2s while queued/running, then stops.
 */
export function useSyncJob(
  workspaceSlug: string,
  projectId: string,
  jobId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.syncJob(workspaceSlug, projectId, jobId ?? ""),
    queryFn: () => projectService.getSyncJob(workspaceSlug, projectId, jobId!),
    enabled: Boolean(workspaceSlug && projectId && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === ESyncJobStatus.Queued || status === ESyncJobStatus.Running
        ? 2000
        : false;
    },
  });
}

/**
 * Request a GitHub-style transfer to another workspace (GIN-85). Nothing moves
 * until the destination owner accepts, so this only refreshes the pending-transfer
 * banner query — the project stays put.
 */
export function useRequestTransfer(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ITransferProjectPayload) =>
      projectService.requestTransfer(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectTransfer(workspaceSlug, projectId),
      });
    },
  });
}

/** The project's current pending transfer, for the source-side banner (null if none). */
export function usePendingTransfer(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectTransfer(workspaceSlug, projectId),
    queryFn: () => projectService.getPendingTransfer(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

/** Cancel the pending transfer (source admin). */
export function useCancelTransfer(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => projectService.cancelTransfer(workspaceSlug, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectTransfer(workspaceSlug, projectId),
      });
    },
  });
}

/** Load a transfer request by token (destination owner's accept page). */
export function useTransferRequest(token: string) {
  return useQuery({
    queryKey: queryKeys.transferRequest(token),
    queryFn: () => projectService.getTransferRequest(token),
    enabled: Boolean(token),
    retry: false,
  });
}

/**
 * Accept a transfer. The project moves into the destination workspace; the
 * resolved project carries its new `workspace_slug` so the caller can route the
 * user there. Refreshes both workspaces' lists.
 */
export function useAcceptTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => projectService.acceptTransfer(token),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(project.workspace_slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(project.workspace_slug) });
    },
  });
}

/** Decline a transfer — nothing moves. */
export function useDeclineTransfer() {
  return useMutation({
    mutationFn: (token: string) => projectService.declineTransfer(token),
  });
}

/** Delete a project and refresh the list. */
export function useDeleteProject(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectService.deleteProject(workspaceSlug, projectId),
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
      queryClient.removeQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}
