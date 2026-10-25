import { useEffect, useRef } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isLiveMeetingStatus } from "@/lib/meetings/meeting-status";
import { meetingService } from "@/services/meetings/meeting.service";
import type { ICreateMeetingPayload, IMeeting, IUpdateMeetingActionItemPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useMeetings(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.meetings(workspaceSlug, projectId),
    queryFn: () => meetingService.list(workspaceSlug, projectId),
    refetchInterval: (query) =>
      query.state.data?.some(
        (m: IMeeting) => isLiveMeetingStatus(m.status) || m.notes_status === "pending",
      )
        ? 3000
        : false,
  });
}

export function useMeeting(workspaceSlug: string, projectId: string, meetingId: string) {
  return useQuery({
    queryKey: queryKeys.meeting(workspaceSlug, projectId, meetingId),
    queryFn: () => meetingService.getMeeting(workspaceSlug, projectId, meetingId),
    enabled: Boolean(meetingId),
    refetchInterval: (query) => {
      const meeting = query.state.data;
      return meeting && (isLiveMeetingStatus(meeting.status) || meeting.notes_status === "pending")
        ? 3000
        : false;
    },
  });
}

export function useMeetingTranscript(
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
  live: boolean,
) {
  const queryClient = useQueryClient();
  // The 3s poll stops the instant `live` flips false, which can land just
  // before the provider's very last segments landed — invalidate once, right
  // on that live→terminal transition, so the final tick's segments still show
  // up without a manual reload. `wasLive` (written only inside the effect,
  // never read during render) is what turns this into a one-shot transition
  // rather than firing again on every render while the meeting stays ended.
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.meetingSegments(workspaceSlug, projectId, meetingId),
      });
    }
    wasLive.current = live;
  }, [live, workspaceSlug, projectId, meetingId, queryClient]);

  return useQuery({
    queryKey: queryKeys.meetingSegments(workspaceSlug, projectId, meetingId),
    queryFn: () => meetingService.segments(workspaceSlug, projectId, meetingId),
    enabled: Boolean(meetingId),
    refetchInterval: live ? 3000 : false,
  });
}

export function useMeetingActionItems(
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.meetingActionItems(workspaceSlug, projectId, meetingId),
    queryFn: () => meetingService.actionItems(workspaceSlug, projectId, meetingId),
    enabled: enabled && Boolean(meetingId),
  });
}

export function useCreateMeeting(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateMeetingPayload) =>
      meetingService.create(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings(workspaceSlug, projectId) });
    },
  });
}

export function useStopMeeting(workspaceSlug: string, projectId: string, meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => meetingService.stop(workspaceSlug, projectId, meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings(workspaceSlug, projectId) });
    },
  });
}

export function useRegenerateMeetingNotes(
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => meetingService.regenerateNotes(workspaceSlug, projectId, meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings(workspaceSlug, projectId) });
    },
  });
}

/** Every story-scoped cache for this project — the same prefix `story`/`projectStories`/etc.
 * query keys share (see `hooks/query-keys.ts`). Approving an action item creates a story, so the
 * board/list caches need to invalidate too. */
function projectStoriesPrefix(workspaceSlug: string, projectId: string) {
  return ["workspaces", workspaceSlug, "projects", projectId, "stories"] as const;
}

function invalidateActionItemCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetingActionItems(workspaceSlug, projectId, meetingId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.meeting(workspaceSlug, projectId, meetingId),
  });
}

export function useUpdateActionItem(workspaceSlug: string, projectId: string, meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: IUpdateMeetingActionItemPayload }) =>
      meetingService.updateActionItem(workspaceSlug, projectId, meetingId, id, payload),
    onSuccess: () => {
      invalidateActionItemCaches(queryClient, workspaceSlug, projectId, meetingId);
    },
  });
}

export function useApproveActionItem(
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      meetingService.approveActionItem(workspaceSlug, projectId, meetingId, id),
    onSuccess: () => {
      invalidateActionItemCaches(queryClient, workspaceSlug, projectId, meetingId);
      queryClient.invalidateQueries({ queryKey: projectStoriesPrefix(workspaceSlug, projectId) });
    },
  });
}

export function useDismissActionItem(
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      meetingService.dismissActionItem(workspaceSlug, projectId, meetingId, id),
    onSuccess: () => {
      invalidateActionItemCaches(queryClient, workspaceSlug, projectId, meetingId);
    },
  });
}

export function useApproveActionItems(
  workspaceSlug: string,
  projectId: string,
  meetingId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      meetingService.approveActionItems(workspaceSlug, projectId, meetingId, ids),
    onSuccess: () => {
      invalidateActionItemCaches(queryClient, workspaceSlug, projectId, meetingId);
      queryClient.invalidateQueries({ queryKey: projectStoriesPrefix(workspaceSlug, projectId) });
    },
  });
}
