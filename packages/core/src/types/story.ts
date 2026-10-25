import type { ID, ISODateString, IOffsetPage, IOffsetPageFilters } from "./common";

export enum EStoryStatus {
  Todo = "todo",
  InProgress = "in_progress",
  InReview = "in_review",
  Done = "done",
}

/** Work-item priority (Plane-style). `None` = unset. */
export enum EStoryPriority {
  Urgent = "urgent",
  High = "high",
  Medium = "medium",
  Low = "low",
  None = "none",
}

/**
 * Work-item type (Plane-style hierarchy). BMAD's "Break down Epics & Stories"
 * step generates `Epic` items, their child `Story` items, and leaf `Task` items.
 */
export enum EStoryType {
  Epic = "epic",
  Feature = "feature",
  Story = "story",
  Task = "task",
  Bug = "bug",
}

export enum EReadinessResult {
  Pass = "pass",
  Concerns = "concerns",
  Fail = "fail",
}

/** T-shirt size for the "simple" planning method (GIN-331). null = unestimated. */
export enum ESize {
  XS = "xs",
  S = "s",
  M = "m",
  L = "l",
  XL = "xl",
}

/**
 * How deleting a work item treats its children (GIN-97). `Detach` keeps children
 * live (parent_id nulled); `Children` soft-deletes the whole subtree together.
 */
export enum EDeleteCascade {
  Detach = "detach",
  Children = "children",
}

/** BMAD metadata attached to a Sprint-0 planning story (see bmad-workflow-guide). */
export interface IStoryBmad {
  workflow: string;
  agent: string;
  artifact: string;
  is_locked: boolean;
  is_required: boolean;
  /** Optional step skipped without producing an artifact. */
  skipped?: boolean;
  /** Only for bmad-check-implementation-readiness — gates sprint planning. */
  readiness_result?: EReadinessResult | null;
}

export interface IStory {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  cycle_id: ID | null;
  module_id: ID | null;
  parent_id: ID | null;
  /** The work item this was duplicated from, if any (GIN-355) — enables a link back to source. */
  cloned_from_id?: ID | null;
  /** Roadmap links (GIN-206) — optional on the wire; null/absent for unlinked rows. */
  milestone_id?: ID | null;
  release_id?: ID | null;
  title: string;
  description: string;
  status: EStoryStatus;
  priority: EStoryPriority;
  /** Work-item type. Optional on the wire (backend may omit); read via storyTypeOf(). */
  type?: EStoryType;
  /** Per-project sequential number backing `code`. Optional on the wire like
   * `type` (not every source populates it yet); null for pre-backfill rows. */
  story_number?: number | null;
  /** Human-readable work-item code, e.g. "WEB-42" (`identifier-story_number`
   * from the backend serializer). Null/absent for pre-backfill rows. */
  code?: string | null;
  /** Planned schedule (date-only YYYY-MM-DD) — drives Calendar + Gantt. */
  start_date: ISODateString | null;
  target_date: ISODateString | null;
  order: number;
  assignee_id: ID | null;
  /** AI agent assigned to a manual (non-BMAD) story; Sprint-0 cards derive their agent from `bmad`. */
  ai_agent_id: ID | null;
  /** Every label on this work item (GIN-475). A work item has many. */
  label_ids: ID[];
  /** @deprecated The first of `label_ids`, kept so readers not yet migrated keep
   *  rendering. Never write through it — writes take `label_ids`. */
  label_id: ID | null;
  estimate_id: ID | null;
  estimate_points: number | null;
  /** Per-method estimate inputs (GIN-331). Optional on the wire; null = unestimated.
   *  `size` is used in the "simple" method, `duration_minutes` in the "time" method —
   *  both independent of points so a method switch preserves each raw value. */
  size?: ESize | null;
  duration_minutes?: number | null;
  sub_issue_count: number;
  /** Present for BMAD Sprint-0 stories; null for ordinary product stories. */
  bmad: IStoryBmad | null;
  /** Custom field values keyed by field_id. */
  custom_fields?: Record<string, string | number | null>;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Story assigned to the current user, with denormalized project labels for home / my-work. */
export interface IAssignedStory extends IStory {
  project_name: string;
  project_identifier: string;
}

/** A soft-deleted work item shown in the workspace trash (GIN-97). */
export interface ITrashedStory extends IAssignedStory {
  deleted_at: ISODateString;
  deleted_by_id: ID | null;
}

export type IStoryPage = IOffsetPage<IStory>;
export type IAssignedStoryPage = IOffsetPage<IAssignedStory>;
export type ITrashedStoryPage = IOffsetPage<ITrashedStory>;

export interface ITrashFilters extends IOffsetPageFilters {
  q?: string;
}

export interface IStoryFilters extends IOffsetPageFilters {
  q?: string;
  status?: EStoryStatus;
  status_in?: EStoryStatus[];
  priority_in?: EStoryPriority[];
  type_in?: EStoryType[];
  product_only?: boolean;
  unassigned?: boolean;
  unassigned_only?: boolean;
  cycle_id?: string;
  module_id?: string;
  assignee_id?: string;
  label_id?: string;
  target_date_from?: string;
  target_date_to?: string;
  scheduled_only?: boolean;
  /**
   * `"manual"`, or a comma-separated list of fields with `-` for descending
   * (`"-priority,target_date"`) — the signed encoding Plane uses. Built by
   * `apiOrderBy`; a string rather than a union because the field list is the
   * sort vocabulary, not a fixed pair.
   */
  order_by?: string;
  /** Canonical GigsQL expression for authoritative server-side filtering (GIN-138). */
  gigsql?: string;
}

export interface IWorkspaceStoryFilters extends IOffsetPageFilters {
  q?: string;
  status?: EStoryStatus;
  product_only?: boolean;
  assignee_id?: string;
  /** Only items the caller subscribes to; the server reads the session user. */
  watching?: boolean;
  /** Narrow to these projects (the dashboard-wide filter). */
  project_ids?: string[];
}

export interface IMyStoriesFilters extends IOffsetPageFilters {
  open_only?: boolean;
}
