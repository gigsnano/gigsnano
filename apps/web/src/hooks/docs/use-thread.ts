import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { APIError } from "@/services/api-error";
import { threadService } from "@/services/docs/thread.service";

import { queryKeys } from "../query-keys";

/** True for the 422 a non-LLM step (track-selection/scope-selection/cleanup-artifacts)
 * returns on thread open — those steps render no chat, only the "mark complete" affordance. */
export function isNonLlmThreadError(error: unknown): boolean {
  return error instanceof APIError && error.status === 422;
}

/** True for the 409 a BMAD-locked story returns on thread open — its prerequisite steps
 * aren't complete, so no chat can start. Matched on the "locked" detail so it doesn't
 * catch the sibling `epic_already_broken_down` 409 from the same endpoint. */
export function isLockedThreadError(error: unknown): boolean {
  if (!(error instanceof APIError) || error.status !== 409) return false;
  const detail = (error.data as { detail?: unknown } | null | undefined)?.detail;
  return typeof detail === "string" && detail.toLowerCase().includes("locked");
}

/** Opens (idempotent 201/200) the BMAD agent thread for a story on mount and returns its
 * persisted transcript. Does not retry on 422 — that's an expected non-LLM-step response. */
export function useOpenThread(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  opts?: { workflow?: string },
) {
  return useQuery({
    queryKey: queryKeys.thread(workspaceSlug, projectId, storyId, opts?.workflow),
    queryFn: () =>
      threadService.openThread(workspaceSlug, projectId, storyId, {
        workflow: opts?.workflow,
      }),
    enabled: Boolean(workspaceSlug && projectId && storyId),
    retry: false,
    staleTime: 0,
  });
}

/** Finalize: LLM extracts the artifact from the conversation and completes the story.
 * Always callable (backend enforces valid state); on success the board/doc queries refresh. */
export function useFinalizeThread(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => threadService.finalizeThread(workspaceSlug, projectId, storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.storyDocuments(workspaceSlug, projectId, storyId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.story(workspaceSlug, projectId, storyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId) });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

/** Finalize-to-description: the agent distills the chat into story.description.
 * Does NOT complete the story; on success the story detail/list queries refresh. */
export function useFinalizeDescription(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => threadService.finalizeDescription(workspaceSlug, projectId, storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.story(workspaceSlug, projectId, storyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId) });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
    },
  });
}
