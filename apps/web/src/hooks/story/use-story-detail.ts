"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/hooks/query-keys";
import { isActiveRunState, runDisplayState } from "@/lib/issues/agent-run-state";
import { storyDetailService } from "@/services/story/story-detail.service";
import type { EAgentAutonomy, ICreateRunPayload } from "@/types/story/agent-run";
import type {
  ICreateStoryCommentPayload,
  ICreateStoryLinkPayload,
  ICreateStoryRelationPayload,
  ICreateTimeEntryPayload,
  IUpdateStoryCommentPayload,
  IUpdateStoryLinkPayload,
} from "@/types/story/story-detail";

function detailKeys(workspaceSlug: string, projectId: string, storyId: string) {
  return {
    links: queryKeys.storyLinks(workspaceSlug, projectId, storyId),
    relations: queryKeys.storyRelations(workspaceSlug, projectId, storyId),
    comments: queryKeys.storyComments(workspaceSlug, projectId, storyId),
    history: queryKeys.storyHistory(workspaceSlug, projectId, storyId),
    subscribe: queryKeys.storySubscribe(workspaceSlug, projectId, storyId),
    timeEntries: queryKeys.storyTimeEntries(workspaceSlug, projectId, storyId),
  };
}

export function useTimeEntries(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storyTimeEntries(workspaceSlug, projectId, storyId),
    queryFn: () => storyDetailService.getTimeEntries(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

export function useCreateTimeEntry(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (payload: ICreateTimeEntryPayload) =>
      storyDetailService.createTimeEntry(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeEntries }),
  });
}

export function useDeleteTimeEntry(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (entryId: string) =>
      storyDetailService.deleteTimeEntry(workspaceSlug, projectId, storyId, entryId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeEntries }),
  });
}

export function useStoryLinks(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storyLinks(workspaceSlug, projectId, storyId),
    queryFn: () => storyDetailService.getLinks(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

export function useCreateStoryLink(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (payload: ICreateStoryLinkPayload) =>
      storyDetailService.createLink(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.links });
      void qc.invalidateQueries({ queryKey: keys.history });
    },
  });
}

export function useDeleteStoryLink(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (linkId: string) =>
      storyDetailService.deleteLink(workspaceSlug, projectId, storyId, linkId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.links });
      void qc.invalidateQueries({ queryKey: keys.history });
    },
  });
}

function useUpdateStoryLink(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: ({ linkId, payload }: { linkId: string; payload: IUpdateStoryLinkPayload }) =>
      storyDetailService.updateLink(workspaceSlug, projectId, storyId, linkId, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.links }),
  });
}

export function useStoryRelations(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storyRelations(workspaceSlug, projectId, storyId),
    queryFn: () => storyDetailService.getRelations(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

/** Agent runs on a work item (GIN-180): live/replayable run timeline. Polls
 * while a run is in flight so the timeline advances live instead of appearing
 * stuck at "Queued" until a manual reload; stops once every run has settled. */
export function useStoryRuns(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: ["story-runs", workspaceSlug, projectId, storyId],
    queryFn: () => storyDetailService.getRuns(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
    // Poll only while a run is genuinely live. A run the UI has already given up
    // on as stale (GIN-482) keeps its backend state forever, so polling on the
    // raw state alone would hammer the API for a run nobody is driving.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const now = query.state.dataUpdatedAt;
      return data.some((r) => isActiveRunState(r.state) && runDisplayState(r, now) !== "stale")
        ? 2500
        : false;
    },
  });
}

/** Task-router recommendation for a work item (GIN-231). */
export function useStoryRoute(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: ["story-route", workspaceSlug, projectId, storyId],
    queryFn: () => storyDetailService.getRoute(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
    staleTime: 60 * 1000,
  });
}

export function useCoordinateRun(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (autonomy: EAgentAutonomy) =>
      storyDetailService.coordinate(workspaceSlug, projectId, storyId, autonomy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-runs", workspaceSlug, projectId, storyId] });
    },
  });
}

/** Staffing candidates for a work item (GIN-186/187). `enabled` lets callers defer
 * the (AI) match until the panel is actually opened — non-users pay nothing. */
export function useStoryMatch(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["story-match", workspaceSlug, projectId, storyId],
    queryFn: () => storyDetailService.getMatch(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId) && enabled,
    staleTime: 60 * 1000,
  });
}

/** Escrow/gig state on a work item (GIN-189). */
export function useStoryGig(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: ["story-gig", workspaceSlug, projectId, storyId],
    queryFn: () => storyDetailService.getGig(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
    staleTime: 30 * 1000,
  });
}

export function usePublishGig(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { story_id: string; title: string; description: string }) =>
      storyDetailService.publishGig(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-gig", workspaceSlug, projectId, storyId] });
    },
  });
}

export function useAgentResources(workspaceSlug: string) {
  return useQuery({
    queryKey: ["agent-resources", workspaceSlug],
    queryFn: () => storyDetailService.listAgentResources(workspaceSlug),
    enabled: Boolean(workspaceSlug),
    staleTime: 30 * 1000,
  });
}

export function useCreateRun(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateRunPayload) =>
      storyDetailService.createRun(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-runs", workspaceSlug, projectId, storyId] });
    },
  });
}

export function useRetryRun(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      storyDetailService.retryRun(workspaceSlug, projectId, storyId, runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-runs", workspaceSlug, projectId, storyId] });
    },
  });
}

/** Approval checkpoints (GIN-181): accept/reject an awaiting-review run. */
export function useReviewRun(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  decision: "approve" | "reject",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      decision === "approve"
        ? storyDetailService.approveRun(workspaceSlug, projectId, storyId, runId)
        : storyDetailService.rejectRun(workspaceSlug, projectId, storyId, runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-runs", workspaceSlug, projectId, storyId] });
    },
  });
}

/** Advisory estimate suggestion (GIN-332). Read-only; never writes an estimate.
 * `enabled` lets callers skip the fetch outside Points mode / already-estimated
 * items so non-suggesting cases pay nothing. */
export function useEstimateSuggestion(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["estimate-suggestion", workspaceSlug, projectId, storyId],
    queryFn: () => storyDetailService.getEstimateSuggestion(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId) && enabled,
    staleTime: 60 * 1000,
  });
}

/** Grounded impact analysis (GIN-202): affected code + related items + risk. */
export function useStoryImpact(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: ["story-impact", workspaceSlug, projectId, storyId],
    queryFn: () => storyDetailService.getImpact(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
    staleTime: 60 * 1000,
  });
}

/** Every relation edge in the project — the graph layout's edges (GIN-159). One call
 * instead of one per story. */
export function useProjectRelations(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.projectRelations(workspaceSlug, projectId),
    queryFn: () => storyDetailService.getProjectRelations(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}

export function useCreateStoryRelation(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (payload: ICreateStoryRelationPayload) =>
      storyDetailService.createRelation(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.relations });
      void qc.invalidateQueries({ queryKey: keys.history });
    },
  });
}

export function useDeleteStoryRelation(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (relationId: string) =>
      storyDetailService.deleteRelation(workspaceSlug, projectId, storyId, relationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.relations });
      void qc.invalidateQueries({ queryKey: keys.history });
    },
  });
}

export function useStoryComments(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storyComments(workspaceSlug, projectId, storyId),
    queryFn: () => storyDetailService.getComments(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

export function useCreateStoryComment(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (payload: ICreateStoryCommentPayload) =>
      storyDetailService.createComment(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.comments });
      void qc.invalidateQueries({ queryKey: keys.history });
      void qc.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      void qc.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
    },
  });
}

function useUpdateStoryComment(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: ({
      commentId,
      payload,
    }: {
      commentId: string;
      payload: IUpdateStoryCommentPayload;
    }) => storyDetailService.updateComment(workspaceSlug, projectId, storyId, commentId, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.comments }),
  });
}

function useDeleteStoryComment(workspaceSlug: string, projectId: string, storyId: string) {
  const qc = useQueryClient();
  const keys = detailKeys(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: (commentId: string) =>
      storyDetailService.deleteComment(workspaceSlug, projectId, storyId, commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.comments });
      void qc.invalidateQueries({ queryKey: keys.history });
    },
  });
}

export function useStoryHistory(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storyHistory(workspaceSlug, projectId, storyId),
    queryFn: () => storyDetailService.getHistory(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

export function useStorySubscription(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storySubscribe(workspaceSlug, projectId, storyId),
    queryFn: () => storyDetailService.getSubscription(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

export function useToggleStorySubscription(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
) {
  const qc = useQueryClient();
  const key = queryKeys.storySubscribe(workspaceSlug, projectId, storyId);
  return useMutation({
    mutationFn: async (subscribed: boolean) => {
      if (subscribed) {
        return storyDetailService.unsubscribe(workspaceSlug, projectId, storyId);
      }
      return storyDetailService.subscribe(workspaceSlug, projectId, storyId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
}
