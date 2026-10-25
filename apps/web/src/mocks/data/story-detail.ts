import { RELATION_TYPE_LABEL } from "@/constants/story-relation-meta";
import type {
  IStoryActivity,
  IStoryComment,
  IStoryLink,
  IStoryRelation,
  ITimeEntry,
} from "@/types/story/story-detail";
import { EStoryActivityField, EStoryActivityKind } from "@/types/story/story-detail";

/** In-memory fixtures for story-detail sub-resources (mock layer only). */
export const storyLinks: IStoryLink[] = [];

export const storyRelations: IStoryRelation[] = [];

export const storyComments: IStoryComment[] = [];

export const storyActivities: IStoryActivity[] = [];

/** Per-user subscription map: `${userId}:${storyId}` → true */
export const storySubscriptions = new Set<string>();

/** Time entries (GIN-55) — shared by the story-detail + workspace-report handlers. */
export const timeEntries: ITimeEntry[] = [];
let timeEntrySeq = 0;

export function nextTimeEntryId() {
  return `te_${++timeEntrySeq}`;
}

let linkSeq = 0;
let relationSeq = 0;
let commentSeq = 0;
let activitySeq = 0;

export function nextLinkId() {
  return `sl_${++linkSeq}`;
}

export function nextRelationId() {
  return `sr_${++relationSeq}`;
}

export function nextCommentId() {
  return `sc_${++commentSeq}`;
}

function nextActivityId() {
  return `sa_${++activitySeq}`;
}

/** Seed a created activity when a story is first opened in dev. */
export function ensureStoryCreatedActivity(
  storyId: string,
  actorId: string,
  actorName: string,
  createdAt: string,
) {
  if (storyActivities.some((a) => a.story_id === storyId && a.field === EStoryActivityField.Created)) {
    return;
  }
  storyActivities.push({
    id: nextActivityId(),
    story_id: storyId,
    kind: EStoryActivityKind.Property,
    field: EStoryActivityField.Created,
    actor_id: actorId,
    actor_name: actorName,
    summary: "created the work item",
    old_value: null,
    new_value: null,
    created_at: createdAt,
  });
}

export function appendStoryActivity(input: Omit<IStoryActivity, "id">) {
  const entry: IStoryActivity = { ...input, id: nextActivityId() };
  storyActivities.push(entry);
  return entry;
}

/** Log a property or transition change from story PATCH (mock layer). */
export function logStoryPropertyChange(
  storyId: string,
  actor: { id: string; name: string },
  field: EStoryActivityField,
  summary: string,
  oldValue: string | null,
  newValue: string | null,
) {
  appendStoryActivity({
    story_id: storyId,
    kind:
      field === EStoryActivityField.Status
        ? EStoryActivityKind.Transition
        : EStoryActivityKind.Property,
    field,
    actor_id: actor.id,
    actor_name: actor.name,
    summary,
    old_value: oldValue,
    new_value: newValue,
    created_at: new Date().toISOString(),
  });
}
