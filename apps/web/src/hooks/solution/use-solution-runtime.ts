import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { solutionRuntimeService } from "@/services/solution/solution-runtime.service";
import { isTerminalJob } from "@/lib/solutions/analysis";
import type { IApproveInferencePayload, IStartAnalysisPayload } from "@/types/solution/analysis";
import type {
  IConnectionCallbackPayload,
  ICreateConnectionRequestPayload,
} from "@/types/solution/connection";

import { queryKeys } from "../query-keys";

export function useAnalysisJob(workspaceSlug: string, jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.analysisJob(workspaceSlug, jobId ?? ""),
    queryFn: () => solutionRuntimeService.getAnalysisJob(workspaceSlug, jobId!),
    enabled: Boolean(workspaceSlug && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || isTerminalJob(status)) return false;
      return 1200;
    },
  });
}

export function useStartAnalysis(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IStartAnalysisPayload) =>
      solutionRuntimeService.startAnalysis(workspaceSlug, payload),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.analysisJob(workspaceSlug, job.id), job);
    },
  });
}

export function useRetryAnalysis(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => solutionRuntimeService.retryAnalysis(workspaceSlug, jobId),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.analysisJob(workspaceSlug, job.id), job);
    },
  });
}

export function useCancelAnalysis(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => solutionRuntimeService.cancelAnalysis(workspaceSlug, jobId),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.analysisJob(workspaceSlug, job.id), job);
    },
  });
}

export function useDecideInference(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      fieldKey,
      ...payload
    }: IApproveInferencePayload & { jobId: string; fieldKey: string }) =>
      solutionRuntimeService.decideInference(workspaceSlug, jobId, fieldKey, payload),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.analysisJob(workspaceSlug, job.id), job);
    },
  });
}

export function useConnections(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.connections(workspaceSlug),
    queryFn: () => solutionRuntimeService.listConnections(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

export function useRequestConnection(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateConnectionRequestPayload) =>
      solutionRuntimeService.requestConnection(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections(workspaceSlug) });
    },
  });
}

export function useConnection(workspaceSlug: string, connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.connection(workspaceSlug, connectionId ?? ""),
    queryFn: () => solutionRuntimeService.getConnection(workspaceSlug, connectionId!),
    enabled: Boolean(workspaceSlug && connectionId),
  });
}

export function useCompleteConnectionCallback(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      ...payload
    }: IConnectionCallbackPayload & { connectionId: string }) =>
      solutionRuntimeService.completeConnectionCallback(workspaceSlug, connectionId, payload),
    onSuccess: (conn) => {
      queryClient.setQueryData(queryKeys.connection(workspaceSlug, conn.id), conn);
      queryClient.invalidateQueries({ queryKey: queryKeys.connections(workspaceSlug) });
    },
  });
}

export function useRevokeConnection(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      solutionRuntimeService.revokeConnection(workspaceSlug, connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections(workspaceSlug) });
    },
  });
}
