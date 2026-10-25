import type {
  ICreateGigsThreadPayload,
  IGigsThread,
  IGigsThreadFilters,
  IGigsThreadPage,
  IUpdateGigsThreadPayload,
} from "@/types/ai/gigs-ai";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

/**
 * Workspace-level GigsAI chat threads. CRUD is plain JSON; the message-send
 * endpoint streams a UI-message-stream and is consumed directly by the chat
 * transport (`@/lib/chat/chat-transport`), not through `APIService.request`.
 */
class GigsAiService extends APIService {
  createThread(workspaceSlug: string, payload: ICreateGigsThreadPayload = {}) {
    return this.post<IGigsThread>(`/workspaces/${workspaceSlug}/gigs-ai/threads/`, payload);
  }

  listThreads(workspaceSlug: string, filters: IGigsThreadFilters = {}) {
    const qs = new URLSearchParams();
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IGigsThreadPage>(`/workspaces/${workspaceSlug}/gigs-ai/threads/${suffix}`);
  }

  getThread(workspaceSlug: string, threadId: string) {
    return this.get<IGigsThread>(`/workspaces/${workspaceSlug}/gigs-ai/threads/${threadId}/`);
  }

  updateThread(workspaceSlug: string, threadId: string, payload: IUpdateGigsThreadPayload) {
    return this.patch<IGigsThread>(
      `/workspaces/${workspaceSlug}/gigs-ai/threads/${threadId}/`,
      payload,
    );
  }

  deleteThread(workspaceSlug: string, threadId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/gigs-ai/threads/${threadId}/`,
    );
  }

  /** Absolute URL for the streaming messages endpoint — used by the chat transport's `api`. */
  messagesUrl(workspaceSlug: string, threadId: string) {
    return `${this.baseURL}/workspaces/${workspaceSlug}/gigs-ai/threads/${threadId}/messages/`;
  }

  /**
   * Absolute URL for the tool-confirmation resume endpoint. A mutating tool
   * pauses the turn server-side (`tool_confirmation` event); POSTing decisions
   * here returns a new SSE stream that completes it. Used by the chat
   * transport's `api` override, not `APIService.request` (see `messagesUrl`).
   */
  confirmToolsUrl(workspaceSlug: string, threadId: string) {
    return `${this.baseURL}/workspaces/${workspaceSlug}/gigs-ai/threads/${threadId}/confirm-tools/`;
  }
}

export const gigsAiService = new GigsAiService();
