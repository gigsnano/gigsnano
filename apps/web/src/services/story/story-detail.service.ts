import type {
  ICreateStoryCommentPayload,
  ICreateStoryLinkPayload,
  ICreateStoryRelationPayload,
  ICreateTimeEntryPayload,
  IEstimateSuggestion,
  IStoryActivity,
  IStoryComment,
  IStoryImpact,
  IStoryLink,
  IProjectRelation,
  IStoryRelation,
  ITimeEntry,
  IUpdateStoryCommentPayload,
  IUpdateStoryLinkPayload,
} from "@/types/story/story-detail";

import type {
  EAgentAutonomy,
  IAgentResource,
  IAgentRun,
  ICreateRunPayload,
  IGigState,
  IMatchCandidate,
  IRouting,
} from "@/types/story/agent-run";

import { APIService } from "../api.service";

class StoryDetailService extends APIService {
  getLinks(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStoryLink[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/links/`,
    );
  }

  createLink(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: ICreateStoryLinkPayload,
  ) {
    return this.post<IStoryLink>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/links/`,
      payload,
    );
  }

  updateLink(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    linkId: string,
    payload: IUpdateStoryLinkPayload,
  ) {
    return this.patch<IStoryLink>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/links/${linkId}/`,
      payload,
    );
  }

  deleteLink(workspaceSlug: string, projectId: string, storyId: string, linkId: string) {
    return this.delete<{ success: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/links/${linkId}/`,
    );
  }

  getImpact(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStoryImpact>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/impact/`,
    );
  }

  /** Advisory estimate suggestion (GIN-332) — read-only, never writes. */
  getEstimateSuggestion(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IEstimateSuggestion>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/estimate-suggestion/`,
    );
  }

  getRelations(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStoryRelation[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/relations/`,
    );
  }

  createRelation(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: ICreateStoryRelationPayload,
  ) {
    return this.post<IStoryRelation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/relations/`,
      payload,
    );
  }

  deleteRelation(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    relationId: string,
  ) {
    return this.delete<{ success: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/relations/${relationId}/`,
    );
  }

  getComments(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStoryComment[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/comments/`,
    );
  }

  createComment(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: ICreateStoryCommentPayload,
  ) {
    return this.post<IStoryComment>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/comments/`,
      payload,
    );
  }

  updateComment(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    commentId: string,
    payload: IUpdateStoryCommentPayload,
  ) {
    return this.patch<IStoryComment>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/comments/${commentId}/`,
      payload,
    );
  }

  deleteComment(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    commentId: string,
  ) {
    return this.delete<{ success: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/comments/${commentId}/`,
    );
  }

  getTimeEntries(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<ITimeEntry[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/time-entries/`,
    );
  }

  createTimeEntry(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: ICreateTimeEntryPayload,
  ) {
    return this.post<ITimeEntry>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/time-entries/`,
      payload,
    );
  }

  deleteTimeEntry(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    entryId: string,
  ) {
    return this.delete<{ success: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/time-entries/${entryId}/`,
    );
  }

  getHistory(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStoryActivity[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/history/`,
    );
  }

  getSubscription(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<{ subscribed: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/subscribe/`,
    );
  }

  subscribe(workspaceSlug: string, projectId: string, storyId: string) {
    return this.post<{ subscribed: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/subscribe/`,
      {},
    );
  }

  unsubscribe(workspaceSlug: string, projectId: string, storyId: string) {
    return this.delete<{ subscribed: false }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/subscribe/`,
    );
  }

  /** Every relation edge in the project, in one call — the graph layout's edges.
   * Not `stories/relations/`: that path would collide with `stories/{id}/`. */
  getProjectRelations(workspaceSlug: string, projectId: string) {
    return this.get<IProjectRelation[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/story-relations/`,
    );
  }

  // --- Agent runs (GIN-180) ---
  getRuns(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IAgentRun[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/runs/`,
    );
  }

  createRun(workspaceSlug: string, projectId: string, storyId: string, payload: ICreateRunPayload) {
    return this.post<IAgentRun>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/runs/`,
      payload,
    );
  }

  retryRun(workspaceSlug: string, projectId: string, storyId: string, runId: string) {
    return this.post<IAgentRun>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/runs/${runId}/retry/`,
    );
  }

  approveRun(workspaceSlug: string, projectId: string, storyId: string, runId: string) {
    return this.post<IAgentRun>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/runs/${runId}/approve/`,
    );
  }

  rejectRun(workspaceSlug: string, projectId: string, storyId: string, runId: string) {
    return this.post<IAgentRun>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/runs/${runId}/reject/`,
    );
  }

  listAgentResources(workspaceSlug: string) {
    return this.get<IAgentResource[]>(`/workspaces/${workspaceSlug}/agent-resources/`);
  }

  getRoute(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IRouting>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/route/`,
    );
  }

  coordinate(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    autonomy: EAgentAutonomy,
  ) {
    return this.post<IAgentRun>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/coordinate/`,
      { autonomy },
    );
  }

  getMatch(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IMatchCandidate[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/match/`,
    );
  }

  publishGig(
    workspaceSlug: string,
    payload: { story_id: string; title: string; description: string },
  ) {
    return this.post<{ id: string }>(
      `/workspaces/${workspaceSlug}/marketplace/listings/`,
      payload,
    );
  }

  getGig(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IGigState>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/gig/`,
    );
  }
}

export const storyDetailService = new StoryDetailService();
