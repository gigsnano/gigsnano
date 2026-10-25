import type { IStory } from "@/types";
import { EStoryStatus, EStoryPriority, EStoryType } from "@/types";
import type { IIssueFilters } from "@/store/ui/issues-view.store";
import type { TGroupBy } from "@/store/ui/issues-view.store";
import {
  STORY_STATUS_ORDER,
  STORY_PRIORITY_ORDER,
  STORY_TYPE_ORDER,
} from "@/constants/story-meta";
import { agentAvatarFromStory } from "./assignee-avatars";
import { sortStories, type ISortCtx, type ISortLevel } from "./story-sort";
import { storyTypeOf } from "./story-type";

/**
 * Assignee-dimension group key. A human assignee wins; otherwise a Sprint-0
 * BMAD card (or a manual story with an `ai_agent_id`) groups under its agent's
 * avatar id, so those cards land in an agent group rather than "Unassigned".
 */
export function assigneeGroupKey(story: IStory): string {
  if (story.assignee_id) return story.assignee_id;
  const agent = agentAvatarFromStory(story);
  if (agent) return agent.id;
  return "unassigned";
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** Inclusive YYYY-MM-DD bounds; undated rows fail when any bound is set. */
function inDateRange(
  iso: string | null | undefined,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  const d = dateOnly(iso);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Apply the active filter facets (empty facet = no constraint). */
export function filterStories(stories: IStory[], filters: IIssueFilters): IStory[] {
  // Hoist each active facet to a Set once — O(rows) lookups instead of O(rows × selected).
  const statusSet = new Set(filters.status);
  const prioritySet = new Set(filters.priority);
  const assigneeSet = new Set(filters.assignee);
  const labelSet = new Set(filters.label);
  const typeSet = new Set(filters.type);
  const cycleSet = new Set(filters.cycle);
  const moduleSet = new Set(filters.module);
  const customSets: (readonly [string, Set<string>])[] = [];
  for (const [fid, values] of Object.entries(filters.custom ?? {})) {
    if (values.length) customSets.push([fid, new Set(values)]);
  }

  return stories.filter((s) => {
    if (statusSet.size && !statusSet.has(s.status)) return false;
    if (prioritySet.size && !prioritySet.has(s.priority)) return false;
    if (assigneeSet.size && !assigneeSet.has(s.assignee_id ?? "unassigned")) return false;
    // An item matches a label filter if it carries ANY of the selected labels —
     // it can hold several at once (GIN-475).
    if (labelSet.size) {
      const ids = s.label_ids ?? [];
      const matches = ids.length ? ids.some((id) => labelSet.has(id)) : labelSet.has("none");
      if (!matches) return false;
    }
    if (typeSet.size && !typeSet.has(storyTypeOf(s))) return false;
    if (cycleSet.size && !(s.cycle_id && cycleSet.has(s.cycle_id))) return false;
    if (moduleSet.size && !(s.module_id && moduleSet.has(s.module_id))) return false;
    for (const [fid, values] of customSets) {
      const raw = s.custom_fields?.[fid];
      const key = raw === undefined || raw === null || raw === "" ? "__none__" : String(raw);
      if (!values.has(key)) return false;
    }
    const titleNeedle = filters.title.trim().toLowerCase();
    if (titleNeedle && !s.title.toLowerCase().includes(titleNeedle)) return false;
    if (!inDateRange(s.target_date, filters.dueFrom, filters.dueTo)) return false;
    if (!inDateRange(s.created_at, filters.createdFrom, filters.createdTo)) return false;
    return true;
  });
}

export interface IStoryGroup {
  /** Stable group key: a status/priority value, an assignee id, "unassigned", or "all". */
  key: string;
  stories: IStory[];
}

/** Group stories in a canonical, stable order per the grouping dimension. */
export function groupStories(
  stories: IStory[],
  groupBy: TGroupBy,
  sort: readonly ISortLevel[],
  customOptions?: string[],
  ctx?: ISortCtx,
): IStoryGroup[] {
  const ordered = sortStories(stories, sort, ctx);

  if (typeof groupBy === "string" && groupBy.startsWith("cf:")) {
    const fid = groupBy.slice(3);
    if (!customOptions || !customOptions.length) return [{ key: "all", stories: ordered }];
    const val = (s: IStory) => {
      const r = s.custom_fields?.[fid];
      return r === undefined || r === null || r === "" ? "__none__" : String(r);
    };
    return [
      ...customOptions.map((o) => ({ key: o, stories: ordered.filter((s) => val(s) === o) })),
      { key: "__none__", stories: ordered.filter((s) => val(s) === "__none__") },
    ];
  }

  if (groupBy === "none") {
    return [{ key: "all", stories: ordered }];
  }

  if (groupBy === "status") {
    return STORY_STATUS_ORDER.map((status) => ({
      key: status,
      stories: ordered.filter((s) => s.status === status),
    }));
  }

  if (groupBy === "priority") {
    return STORY_PRIORITY_ORDER.map((priority) => ({
      key: priority,
      stories: ordered.filter((s) => s.priority === priority),
    }));
  }

  if (groupBy === "type") {
    return STORY_TYPE_ORDER.map((type) => ({
      key: type,
      stories: ordered.filter((s) => storyTypeOf(s) === type),
    }));
  }

  // assignee — one group per human assignee or BMAD/roster agent, unassigned last
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const s of ordered) {
    const key = assigneeGroupKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  keys.sort((a, b) => (a === "unassigned" ? 1 : b === "unassigned" ? -1 : 0));
  return keys.map((key) => ({
    key,
    stories: ordered.filter((s) => assigneeGroupKey(s) === key),
  }));
}
