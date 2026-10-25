import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { agentDelegationService } from "@/services/ai/agent-delegation.service";
import { consumeDelegationStream } from "@/lib/ai/delegation-stream";
import { isTerminalDelegationStatus } from "@/lib/ai/delegation-status";
import { shouldUseMock } from "@/services/mock-fallback";
import type {
  ICreateDelegationPayload,
  IDelegation,
  ILaunchStoryPayload,
} from "@/types/ai/agent-delegation";

import { queryKeys } from "../query-keys";

export function useCreateDelegation(slug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateDelegationPayload) =>
      agentDelegationService.create(slug, projectId, storyId, payload),
    onSuccess: (d) =>
      qc.setQueryData(queryKeys.delegation(slug, projectId, d.id), d),
  });
}

/** "Accept & run" the Execution Profile (GIN-342): launch to a connected agent
 * with the pinned skills applied, then seed the delegation cache so the status
 * card streams immediately. */
export function useLaunchStory(slug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ILaunchStoryPayload) =>
      agentDelegationService.launch(slug, projectId, storyId, payload),
    onSuccess: (res) =>
      qc.setQueryData(queryKeys.delegation(slug, projectId, res.delegation.id), res.delegation),
  });
}

function delegationStreamPath(slug: string, projectId: string, id: string) {
  return `/workspaces/${slug}/projects/${projectId}/delegations/${id}/stream/`;
}

/**
 * Live status. Mock mode polls (time-derived state machine). Real backend opens
 * SSE and refetches once terminal for the full result payload.
 */
export function useDelegation(
  slug: string,
  projectId: string,
  id: string | undefined,
) {
  const qc = useQueryClient();
  const streamPath = id ? delegationStreamPath(slug, projectId, id) : "";
  const liveStream = id ? !shouldUseMock("GET", streamPath) : false;

  const query = useQuery({
    queryKey: id ? queryKeys.delegation(slug, projectId, id) : ["delegation", "none"],
    queryFn: () => agentDelegationService.getDelegation(slug, projectId, id!),
    enabled: !!id,
    refetchInterval: (q) => {
      if (liveStream) return false;
      const status = q.state.data?.status;
      return status && isTerminalDelegationStatus(status) ? false : 1200;
    },
  });

  useEffect(() => {
    if (!id || !liveStream) return;

    const ac = new AbortController();
    const key = queryKeys.delegation(slug, projectId, id);

    void consumeDelegationStream(
      agentDelegationService.streamUrl(slug, projectId, id),
      {
        onStatus: (status) => {
          qc.setQueryData<IDelegation | undefined>(key, (prev) =>
            prev
              ? {
                  ...prev,
                  status,
                  updated_at: new Date().toISOString(),
                }
              : prev,
          );
        },
        onDone: () => {
          void qc.invalidateQueries({ queryKey: key });
        },
        onError: () => {
          void qc.invalidateQueries({ queryKey: key });
        },
      },
      ac.signal,
    );

    return () => ac.abort();
  }, [id, liveStream, slug, projectId, qc]);

  return query;
}

export function useCancelDelegation(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentDelegationService.cancel(slug, projectId, id),
    onSuccess: (d) => qc.setQueryData(queryKeys.delegation(slug, projectId, d.id), d),
  });
}

export function useRetryDelegation(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentDelegationService.retry(slug, projectId, id),
    onSuccess: (d) => qc.setQueryData(queryKeys.delegation(slug, projectId, d.id), d),
  });
}
