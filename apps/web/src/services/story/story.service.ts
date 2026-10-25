import type {
  EReadinessResult,
  ESize,
  EStoryType,
  IAssignedStory,
  IAssignedStoryPage,
  IMyStoriesFilters,
  IStory,
  IStoryFilters,
  IStoryPage,
  ITrashedStoryPage,
  ITrashFilters,
  IWorkspaceStoryFilters,
} from "@/types";
import type { ID, ISODateString } from "@/types/common";
import { EStoryStatus, EStoryPriority, EDeleteCascade } from "@/types";

import { appendStoryListParams } from "@/lib/pagination/story-query";
import { APIService } from "../api.service";

export interface ICreateStoryPayload {
  title: string;
  description?: string;
  cycle_id?: ID | null;
  module_id?: ID | null;
  status?: EStoryStatus;
  parent_id?: ID | null;
  priority?: EStoryPriority;
  type?: EStoryType;
  assignee_id?: ID | null;
  label_ids?: ID[];
  start_date?: ISODateString | null;
  target_date?: ISODateString | null;
  estimate_id?: ID | null;
  estimate_points?: number | null;
  size?: ESize | null;
  duration_minutes?: number | null;
}

/**
 * What `description` (and comment bodies) are expressed in. Stated by the
 * caller, never inferred from the content — ADR 0001. Absent means "html",
 * which is what the editor sent before it emitted canonical JSON.
 */
export type TContentFormat = "json" | "markdown" | "html";

export interface IUpdateStoryPayload {
  status?: EStoryStatus;
  priority?: EStoryPriority;
  order?: number;
  description?: string;
  content_format?: TContentFormat;
  start_date?: ISODateString | null;
  target_date?: ISODateString | null;
  skipped?: boolean;
  readiness_result?: EReadinessResult;
  assignee_id?: ID | null;
  ai_agent_id?: ID | null;
  label_ids?: ID[];
  estimate_id?: ID | null;
  estimate_points?: number | null;
  size?: ESize | null;
  duration_minutes?: number | null;
  parent_id?: ID | null;
  cycle_id?: ID | null;
  module_id?: ID | null;
  title?: string;
  type?: EStoryType;
  /** Partial custom-field value patch, keyed by field_id (merged server-side). */
  custom_fields?: Record<string, string | number | null>;
}

/** What a duplicate copies vs resets (GIN-355). Server defaults apply when omitted. */
export interface ICloneCopyOptions {
  description?: boolean;
  priority?: boolean;
  labels?: boolean;
  estimate?: boolean;
  module?: boolean;
  custom_fields?: boolean;
  parent?: boolean;
  assignee?: boolean;
  cycle?: boolean;
  dates?: boolean;
  date_mode?: "exact" | "shift";
  new_start_date?: ISODateString | null;
  relations?: boolean;
  include_children?: boolean;
  child_depth?: number | null;
  max_items?: number;
}

/** Edited values for the new root item (the duplicate-and-edit form). */
export interface ICloneRootOverrides {
  title?: string;
  description?: string;
  content_format?: TContentFormat;
  type?: EStoryType;
  priority?: EStoryPriority;
  label_ids?: ID[];
  estimate_id?: ID | null;
  estimate_points?: number | null;
  module_id?: ID | null;
  assignee_id?: ID | null;
  start_date?: ISODateString | null;
  target_date?: ISODateString | null;
  custom_fields?: Record<string, unknown>;
}

export interface ICloneStoryPayload {
  source_id: string;
  options?: ICloneCopyOptions;
  overrides?: ICloneRootOverrides;
}

export interface IClonePreview {
  source_id: string;
  source_code: string | null;
  prefill: {
    title: string;
    description: string;
    type: EStoryType;
    priority: EStoryPriority;
    label_ids: ID[];
    estimate_id: ID | null;
    estimate_points: number | null;
    module_id: ID | null;
    custom_fields: Record<string, unknown>;
  };
  copyable_fields: string[];
  reset_fields: string[];
  child_count: number;
}

export interface ICloneItem {
  source_id: string | null;
  id: string;
  code: string | null;
  title: string;
}

export interface ICloneResult {
  source_id: string;
  root_id: string;
  root_code: string | null;
  created: ICloneItem[];
  copied_fields: string[];
  reset_fields: string[];
  warnings: string[];
}

export const ISSUES_PAGE_SIZE = 50;
const ALL_STORIES_PAGE_SIZE = 200;

class StoryService extends APIService {
  getSprintZeroStories(workspaceSlug: string, projectId: string) {
    return this.get<IStory[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/sprint-zero/stories/`,
    );
  }

  updateStory(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: IUpdateStoryPayload,
  ) {
    return this.patch<IStory>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/`,
      payload,
    );
  }

  moveStory(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    status: EStoryStatus,
  ) {
    return this.updateStory(workspaceSlug, projectId, storyId, { status });
  }

  completeStory(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    readinessResult?: EReadinessResult,
  ) {
    return this.updateStory(workspaceSlug, projectId, storyId, {
      status: EStoryStatus.Done,
      ...(readinessResult ? { readiness_result: readinessResult } : {}),
    });
  }

  skipStory(workspaceSlug: string, projectId: string, storyId: string) {
    return this.updateStory(workspaceSlug, projectId, storyId, { skipped: true });
  }

  assignStory(workspaceSlug: string, projectId: string, storyId: string, assigneeId: ID | null) {
    return this.updateStory(workspaceSlug, projectId, storyId, { assignee_id: assigneeId });
  }

  assignStoryAgent(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    agentId: ID | null,
  ) {
    return this.updateStory(workspaceSlug, projectId, storyId, { ai_agent_id: agentId });
  }

  /** Set-replacement: the given ids become the item's complete label set (GIN-475). */
  updateStoryLabels(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    labelIds: ID[],
  ) {
    return this.updateStory(workspaceSlug, projectId, storyId, { label_ids: labelIds });
  }

  updateStoryEstimate(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    estimateId: ID | null,
    estimatePoints: number | null,
  ) {
    return this.updateStory(workspaceSlug, projectId, storyId, {
      estimate_id: estimateId,
      estimate_points: estimatePoints,
    });
  }

  getStory(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStory>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/`,
    );
  }

  getProjectStories(workspaceSlug: string, projectId: string, filters: IStoryFilters = {}) {
    const qs = new URLSearchParams();
    appendStoryListParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IStoryPage>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${suffix}`,
    );
  }

  /** Fetch every project story by paging through the API (for kanban/board views). */
  async getAllProjectStories(workspaceSlug: string, projectId: string): Promise<IStory[]> {
    const items: IStory[] = [];
    let offset = 0;
    while (true) {
      const page = await this.getProjectStories(workspaceSlug, projectId, {
        limit: ALL_STORIES_PAGE_SIZE,
        offset,
      });
      items.push(...page.items);
      if (offset + page.limit >= page.total) break;
      offset += page.limit;
    }
    return items;
  }

  getWorkspaceStories(workspaceSlug: string, filters: IWorkspaceStoryFilters = {}) {
    const qs = new URLSearchParams();
    appendStoryListParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IStoryPage>(`/workspaces/${workspaceSlug}/stories/${suffix}`);
  }

  getMyStories(workspaceSlug: string, filters: IMyStoriesFilters = {}) {
    const qs = new URLSearchParams();
    appendStoryListParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IAssignedStoryPage>(`/workspaces/${workspaceSlug}/my-stories/${suffix}`);
  }

  getCycleStories(workspaceSlug: string, projectId: string, cycleId: string) {
    return this.get<IStory[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/stories/`,
    );
  }

  getSubStories(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IStory[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/sub-stories/`,
    );
  }

  getModuleStories(workspaceSlug: string, projectId: string, moduleId: string) {
    return this.get<IStory[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/stories/`,
    );
  }

  deleteStory(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    cascade?: EDeleteCascade,
  ) {
    const query = cascade === EDeleteCascade.Children ? "?cascade=children" : "";
    return this.delete<{ success: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/${query}`,
    );
  }

  createStory(workspaceSlug: string, projectId: string, payload: ICreateStoryPayload) {
    return this.post<IStory>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/`,
      payload,
    );
  }

  /** Duplicate-and-edit prefill: copyable values + which fields copy vs reset (GIN-355). */
  clonePreview(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IClonePreview>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/clone-preview/`,
    );
  }

  /** Create an independent copy of a work item into `destProjectId` (GIN-355). */
  cloneStory(workspaceSlug: string, destProjectId: string, payload: ICloneStoryPayload) {
    return this.post<ICloneResult>(
      `/workspaces/${workspaceSlug}/projects/${destProjectId}/stories/clone/`,
      payload,
    );
  }

  /** Workspace-wide trash — soft-deleted work items across every accessible project (GIN-97). */
  listTrash(workspaceSlug: string, filters: ITrashFilters = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.offset != null) params.set("offset", String(filters.offset));
    const query = params.toString();
    return this.get<ITrashedStoryPage>(
      `/workspaces/${workspaceSlug}/trash/${query ? `?${query}` : ""}`,
    );
  }

  restoreStory(workspaceSlug: string, projectId: string, storyId: string) {
    return this.post<IStory>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/restore/`,
    );
  }

  /** Permanently delete a trashed item (and its trashed subtree). Irreversible. */
  purgeStory(workspaceSlug: string, projectId: string, storyId: string) {
    return this.delete<{ success: true }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/purge/`,
    );
  }
}

export const storyService = new StoryService();
