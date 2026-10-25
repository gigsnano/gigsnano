import type { IFinalizeDescriptionResult, IFinalizeThreadResult, IThreadOut } from "@/types";

import { APIService } from "../api.service";

/**
 * BMAD agent chat thread lifecycle (`WorkflowSession`). Open/get/finalize are
 * plain JSON; the message-send endpoint is consumed directly by the SSE chat
 * transport (`@/lib/chat/chat-transport`), not through `APIService.request`, since
 * it streams a UI-message-stream response rather than a single JSON body.
 */
class ThreadService extends APIService {
  /** Idempotent: 201 opens a new thread, 200 returns the existing one. Non-LLM
   * steps (track-selection/scope-selection/cleanup-artifacts) 422. */
  openThread(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    opts?: { workflow?: string },
  ) {
    return this.post<IThreadOut>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/thread/`,
      opts?.workflow ? { workflow: opts.workflow } : undefined,
    );
  }

  getThread(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IThreadOut>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/thread/`,
    );
  }

  finalizeThread(workspaceSlug: string, projectId: string, storyId: string) {
    return this.post<IFinalizeThreadResult>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/thread/finalize/`,
    );
  }

  /** Distill the conversation into the task's final description (writes story.description). */
  finalizeDescription(workspaceSlug: string, projectId: string, storyId: string) {
    return this.post<IFinalizeDescriptionResult>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/thread/finalize-description/`,
    );
  }

  /** Absolute URL for the streaming messages endpoint — used by the chat transport's `api` option. */
  messagesUrl(workspaceSlug: string, projectId: string, storyId: string) {
    return `${this.baseURL}/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/thread/messages/`;
  }
}

export const threadService = new ThreadService();
