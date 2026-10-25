import type { ID, ISODateString } from "@/types/common";
import type { EStoryPriority, EStoryStatus } from "@/types/story/story";
import type { TContentFormat } from "@/services/story/story.service";

/** Plane relation types. */
export enum EStoryRelationType {
  RelatesTo = "relates_to",
  Blocks = "blocking",
  BlockedBy = "blocked_by",
  Duplicate = "duplicate",
}

/** One relation edge from `GET .../story-relations/` — every edge in the project, in
 * one call (GIN-159). Leaner than `IStoryRelation`: the graph already holds every
 * story, so titles/keys per edge would just be the story list again, once per edge. */
export interface IProjectRelation {
  story_id: ID;
  related_story_id: ID;
  relation_type: EStoryRelationType;
}

export interface IStoryLink {
  id: ID;
  story_id: ID;
  title: string;
  url: string;
  created_by_id: ID;
  created_by_name: string;
  created_at: ISODateString;
}

/** Hours logged against a work item (GIN-55 time tracking). */
export interface ITimeEntry {
  id: ID;
  story_id: ID;
  hours: number;
  note: string;
  user_id: ID | null;
  user_name: string;
  user_avatar_url: string | null;
  created_at: ISODateString;
}

export interface ICreateTimeEntryPayload {
  hours: number;
  note?: string;
}

export interface IStoryRelation {
  id: ID;
  story_id: ID;
  related_story_id: ID;
  relation_type: EStoryRelationType;
  /** Denormalized for list display */
  related_story_title: string;
  related_story_key: string;
  created_at: ISODateString;
}

export interface IStoryComment {
  id: ID;
  story_id: ID;
  body: string;
  author_id: ID;
  author_name: string;
  author_avatar_url: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export enum EStoryActivityKind {
  Property = "property",
  Comment = "comment",
  Transition = "transition",
}

export enum EStoryActivityField {
  Created = "created",
  Title = "title",
  Description = "description",
  Status = "status",
  Priority = "priority",
  Assignee = "assignee",
  StartDate = "start_date",
  TargetDate = "target_date",
  Label = "label",
  Parent = "parent",
  Cycle = "cycle",
  Module = "module",
  Link = "link",
  Attachment = "attachment",
  Relation = "relation",
}

export interface IStoryActivity {
  id: ID;
  story_id: ID;
  kind: EStoryActivityKind;
  field: EStoryActivityField | null;
  actor_id: ID;
  actor_name: string;
  /** Human-readable summary */
  summary: string;
  old_value: string | null;
  new_value: string | null;
  created_at: ISODateString;
}

export interface ICreateStoryLinkPayload {
  title: string;
  url: string;
}

export interface IUpdateStoryLinkPayload {
  title?: string;
  url?: string;
}

export interface ICreateStoryRelationPayload {
  relation_type: EStoryRelationType;
  related_story_id: ID;
}

export interface ICreateStoryCommentPayload {
  body: string;
  /** Stated, never inferred (ADR 0001). Absent means "html". */
  content_format?: TContentFormat;
}

export interface IUpdateStoryCommentPayload {
  body: string;
  content_format?: TContentFormat;
}

/** Grounded impact analysis for a work item (GIN-200/202). */
export interface IStoryImpactRelatedItem {
  /** Story id — links to the work-item detail route. */
  id: ID;
  code: string;
  title: string;
  status: EStoryStatus;
  priority: EStoryPriority;
  reason: string;
}

export interface IStoryImpactRisk {
  level: "low" | "medium" | "high";
  score: number;
  rationale: string;
}

export interface IStoryImpactCitation {
  type: string;
  ref: string;
}

export interface IStoryImpact {
  story_code: string;
  affected_files: string[];
  related_items: IStoryImpactRelatedItem[];
  risk: IStoryImpactRisk;
  citations: IStoryImpactCitation[];
}

/** Advisory estimate suggestion (GIN-332) — `GET .../stories/{id}/estimate-suggestion/`.
 * Never written automatically; the user Confirms/Modifies/Dismisses. `applicable`
 * is false in Automatic/Simple/Time modes (or when there's no value to suggest);
 * nulls where the backend is honest about insufficient history rather than
 * inventing a value. `similar_item_ids` are the cited completed items. */
export interface IEstimateSuggestion {
  applicable: boolean;
  planning_method: string;
  suggested_value: number | null;
  low: number | null;
  high: number | null;
  confidence: string; // "none" | "low" | "medium" | "high"
  reasons: string[];
  similar_item_ids: ID[];
  model_version: string;
}
