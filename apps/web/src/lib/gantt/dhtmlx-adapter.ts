/**
 * GigsNano ↔ dhtmlx-gantt adapter (GIN-349, Phase 1 of GIN-315).
 *
 * The single seam between our story model and the dhtmlx-gantt Community library.
 * Everything library-specific about task/link *shapes* lives here so the rest of
 * the app — and the backend — never depend on dhtmlx, and the UI library can be
 * swapped without touching data code. Pure + framework-free so it unit-tests
 * without loading the third-party UI (an explicit GIN-349 acceptance criterion).
 *
 * dhtmlx conventions encoded here: `duration` is whole days; `progress` is 0..1;
 * `parent` is `0` for a root; a task needs a start date, so only *scheduled*
 * stories (at least one date) become tasks — unscheduled work is the backlog in
 * Phase 3 (GIN-351), never a silently-invented bar here.
 */

import { EStoryStatus, EStoryRelationType, type IProjectRelation, type IStory } from "@/types";

/** A dhtmlx-gantt task (the subset we populate). */
export interface IGanttTask {
  id: string;
  text: string;
  start_date: string; // "YYYY-MM-DD" — paired with gantt.config.date_format
  duration: number; // whole days, >= 1
  progress: number; // 0..1
  parent: string | 0;
  /** Passthrough for our own grid columns / tooltips — dhtmlx ignores unknown keys. */
  gn_code: string;
  gn_title: string;
  gn_status: EStoryStatus;
  gn_assignee_id: string | null;
  gn_assignee: string; // resolved display name, "" when unassigned/unknown
  gn_due: string | null; // "YYYY-MM-DD" due date for the Due column
  gn_unscheduled_end: boolean; // only one date was known → duration is a placeholder
  /** Something blocks this item — a blocking relation, or a first-class blocker. */
  gn_blocked: boolean;
  /** dhtmlx renders "milestone" as a diamond; a deadline must not look like work. */
  type?: "milestone";
}

/**
 * How an edge is drawn. `blocking` is a real scheduling dependency (solid);
 * `related` is an informational association (dashed) — it carries no ordering,
 * which is exactly why it must not look like one.
 */
export type TGanttLinkKind = "blocking" | "related";

/** A dhtmlx-gantt dependency link. type: "0"=FS "1"=SS "2"=FF "3"=SF. */
export interface IGanttLink {
  id: string;
  source: string;
  target: string;
  type: string;
  /** Passthrough for `templates.link_class` — dhtmlx ignores unknown keys. */
  gn_kind: TGanttLinkKind;
}

export interface IGanttData {
  data: IGanttTask[];
  links: IGanttLink[];
}

/** Status → a status-based progress fallback (GIN-315: explicit field / rollup come later). */
const STATUS_PROGRESS: Record<EStoryStatus, number> = {
  [EStoryStatus.Todo]: 0,
  [EStoryStatus.InProgress]: 0.5,
  [EStoryStatus.InReview]: 0.8,
  [EStoryStatus.Done]: 1,
};

const DAY_MS = 86_400_000;

/** ISO date (or datetime) → "YYYY-MM-DD", or null. */
export function toDayString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function parseDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Inclusive whole-day span between two "YYYY-MM-DD" days (min 1). */
export function inclusiveDuration(start: string, end: string): number {
  const days = Math.round((parseDay(end) - parseDay(start)) / DAY_MS) + 1;
  return Math.max(1, days);
}

/** Add whole days to a "YYYY-MM-DD" day, returning "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  return new Date(parseDay(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A task's start as epoch ms, tolerating BOTH shapes it can be in.
 *
 * `gantt.parse()` mutates each task in place, replacing our "YYYY-MM-DD"
 * `start_date` string with a `Date`. The same task object is the one React
 * handed in, so any code reading `start_date` after a parse sees a Date — and
 * anything that assumed a string (a `.split()`, or dhtmlx's own `str_to_date`,
 * which calls `.match()` on its argument) throws.
 */
export function startMs(start: string | Date): number {
  if (start instanceof Date) return start.getTime();
  const [y, m, d] = start.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Epoch ms of the earliest task start, or null for an empty set. Compared
 * numerically rather than by sorting the raw values: post-parse those are Date
 * objects, and `.sort()` would order them by their "Fri Jul 03 2026" string
 * form — alphabetically, so the earliest would rarely be first.
 */
export function earliestStartMs(tasks: { start_date: string | Date }[]): number | null {
  let earliest = Infinity;
  for (const t of tasks) earliest = Math.min(earliest, startMs(t.start_date));
  return Number.isFinite(earliest) ? earliest : null;
}

/** True when a story can be placed on the timeline (has at least one date). */
export function isScheduled(story: IStory): boolean {
  return Boolean(story.start_date || story.target_date);
}

/**
 * The Due<Start guard for inline/backlog scheduling (GIN-351). Only meaningful
 * when BOTH dates exist — a single-date schedule is valid (1-day marker), and a
 * dragged/resized bar can't invert (dhtmlx `min_duration` keeps it >= 1 day), so
 * this is the one place inline edits are rejected. Compares "YYYY-MM-DD" strings,
 * which order lexicographically the same as chronologically.
 */
export function isDueBeforeStart(
  start: string | null | undefined,
  due: string | null | undefined,
): boolean {
  const s = toDayString(start);
  const d = toDayString(due);
  return Boolean(s && d && d < s);
}

/**
 * True when a task's due date has passed and it isn't Done — the cue for the
 * overdue bar edge and the `⚠` in the Due column. An item with no due date can
 * never be overdue (nothing was promised), and today itself is not yet late.
 */
export function isTaskOverdue(
  task: Pick<IGanttTask, "gn_due" | "gn_status" | "gn_unscheduled_end">,
  today: string,
): boolean {
  if (task.gn_unscheduled_end || !task.gn_due) return false;
  if (task.gn_status === EStoryStatus.Done) return false;
  return task.gn_due < today;
}

/**
 * Schedule health (GIN-379 §12): the one thing a planner scans for. Ordered by
 * what a reader most needs to know — an overdue item's missing assignee is not
 * the headline — and each state is independently visible, never colour-only.
 *
 * `at_risk` is deliberately narrow: due within the window AND barely started.
 * Widening it to "due soon" would flag most of a healthy sprint, and a warning
 * everything trips is one nobody reads.
 */
export type TScheduleHealth = "overdue" | "blocked" | "at_risk" | "unassigned" | "on_track";

/** Days before the due date at which unstarted work starts reading as at risk. */
export const AT_RISK_WINDOW_DAYS = 3;

export function scheduleHealth(
  task: Pick<
    IGanttTask,
    "gn_due" | "gn_status" | "gn_unscheduled_end" | "gn_assignee_id" | "gn_blocked"
  > & { progress?: number },
  today: string,
): TScheduleHealth {
  if (task.gn_status === EStoryStatus.Done) return "on_track";
  if (isTaskOverdue(task, today)) return "overdue";
  if (task.gn_blocked) return "blocked";
  const due = task.gn_unscheduled_end ? null : task.gn_due;
  if (due) {
    const daysLeft = Math.round((parseDay(due) - parseDay(today)) / DAY_MS);
    if (daysLeft <= AT_RISK_WINDOW_DAYS && (task.progress ?? 0) < 0.5) return "at_risk";
  }
  // Unassigned is last: it matters, but it is a staffing gap rather than a
  // schedule failure, and it must not mask a date problem.
  if (!task.gn_assignee_id) return "unassigned";
  return "on_track";
}

/** Human wording for the health states — tooltips say it, icons only echo it. */
export const HEALTH_LABEL: Record<TScheduleHealth, string> = {
  overdue: "Overdue — the due date has passed",
  blocked: "Blocked — something is stopping this",
  at_risk: "At risk — due soon and barely started",
  unassigned: "Unassigned — nobody owns this",
  on_track: "On track",
};

/**
 * A milestone is a moment, not a span: a zero-length commitment (a single date)
 * on an item that represents an outcome. Rendering those as one-day *bars* is
 * what makes a Gantt unreadable — the eye cannot tell a deadline from a day of
 * work (GIN-379 §9).
 */
export function isMilestone(story: IStory): boolean {
  const start = toDayString(story.start_date);
  const end = toDayString(story.target_date);
  const singleInstant = !start || !end || start === end;
  return singleInstant && MILESTONE_TYPES.has(story.type ?? "");
}

const MILESTONE_TYPES = new Set<string>(["epic", "feature"]);

/** One scheduled story → a dhtmlx task, or null when it has no dates (backlog). */
export function storyToTask(story: IStory, code: string, assigneeName = ""): IGanttTask | null {
  const start = toDayString(story.start_date);
  const end = toDayString(story.target_date);
  if (!start && !end) return null;

  // Anchor to whichever date exists; a single date renders a 1-day marker rather
  // than an invented range (the real range is the user's to set — GIN-351).
  const anchor = (start ?? end)!;
  const finish = start && end ? end : anchor;
  const status = story.status;
  return {
    id: story.id,
    text: `${code} ${story.title}`.trim(),
    start_date: anchor,
    duration: inclusiveDuration(anchor, finish),
    progress: STATUS_PROGRESS[status] ?? 0,
    parent: story.parent_id ?? 0,
    gn_code: code,
    gn_title: story.title,
    gn_status: status,
    gn_assignee_id: story.assignee_id ?? null,
    gn_assignee: assigneeName,
    gn_due: end,
    gn_unscheduled_end: !(start && end),
    gn_blocked: false, // filled by buildGanttData, which can see the relation graph
    ...(isMilestone(story) ? { type: "milestone" as const } : {}),
  };
}

/** Relations with no ordering semantics — drawn dashed, never as a dependency. */
const RELATED_TYPES: ReadonlySet<EStoryRelationType> = new Set([
  EStoryRelationType.RelatesTo,
  EStoryRelationType.Duplicate,
]);

/** Order-independent key for a pair of stories. `relates_to` and `duplicate` are
 *  symmetric, so A→B and B→A are one edge and must not draw twice. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Structured relations → dhtmlx arrows (GIN-352).
 *
 * Two kinds, visually distinct:
 * - `blocking` → a solid Finish-to-Start arrow. Direction is meaningful, so
 *   these dedupe *directed*: A blocks B and B blocks A are different edges.
 *   `blocked_by` is the same edge mirrored and is skipped, or every dependency
 *   would draw twice.
 * - `relates_to` / `duplicate` → a dashed line. These are symmetric, so they
 *   dedupe *undirected*.
 *
 * Blocking is resolved first and claims the pair: when two stories are both
 * blocking and related, the dependency is the stronger statement and drawing a
 * second dashed line beside it says nothing extra.
 *
 * Endpoints must both be rendered tasks, so no arrow dangles off a backlog item.
 */
export function relationsToLinks(
  relations: IProjectRelation[],
  taskIds: Set<string>,
): IGanttLink[] {
  const links: IGanttLink[] = [];
  const seen = new Set<string>();
  const claimedPairs = new Set<string>();
  const connects = (r: IProjectRelation) =>
    taskIds.has(r.story_id) && taskIds.has(r.related_story_id);

  for (const r of relations) {
    if (r.relation_type !== EStoryRelationType.Blocks || !connects(r)) continue;
    const id = `${r.story_id}->${r.related_story_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    claimedPairs.add(pairKey(r.story_id, r.related_story_id));
    links.push({
      id,
      source: r.story_id,
      target: r.related_story_id,
      type: "0",
      gn_kind: "blocking",
    });
  }

  for (const r of relations) {
    if (!RELATED_TYPES.has(r.relation_type) || !connects(r)) continue;
    const pair = pairKey(r.story_id, r.related_story_id);
    if (claimedPairs.has(pair)) continue;
    claimedPairs.add(pair);
    links.push({
      id: `related:${pair}`,
      source: r.story_id,
      target: r.related_story_id,
      type: "0",
      gn_kind: "related",
    });
  }

  return links;
}

/**
 * Map the scheduled stories to a dhtmlx `{data, links}` set. `getCode` builds the
 * display code (e.g. `WEB-42`). Parent rows are only emitted when the parent is
 * itself in the set, so dhtmlx never dangles a task under a missing parent; the
 * tree + rollups (GIN-350/352) render from `parent`. `relations` add blocking
 * dependency arrows between scheduled tasks (GIN-352). `nested` toggles the Flat
 * view mode — when false every task is flattened to the root.
 */
export function storiesToGanttData(
  stories: IStory[],
  getCode: (story: IStory) => string,
  getAssigneeName: (story: IStory) => string = () => "",
  relations: IProjectRelation[] = [],
  /** When false, every task is a root — the Flat view mode. Default keeps the tree. */
  nested = true,
): IGanttData {
  const tasks: IGanttTask[] = [];
  for (const s of stories) {
    const t = storyToTask(s, getCode(s), getAssigneeName(s));
    if (t) tasks.push(t);
  }
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    if (t.parent !== 0 && !ids.has(t.parent)) t.parent = 0; // reparent orphans to root
  }
  // Flat mode: dhtmlx nests from `parent` alone, so clearing it is the whole
  // difference between an indented tree and a plain row list.
  if (!nested) for (const t of tasks) t.parent = 0;
  // Blocked-ness is a property of the graph, not of a row, so it is resolved here
  // where the relations are in hand. A blocker that is already Done blocks
  // nothing — the same rule the backend readiness audit applies (GIN-383/384),
  // and getting it wrong would paint half a finished project red.
  const byId = new Map(stories.map((s) => [s.id, s]));
  const blocked = new Set<string>();
  for (const r of relations) {
    const [blockerId, blockedId] =
      r.relation_type === EStoryRelationType.Blocks
        ? [r.story_id, r.related_story_id]
        : r.relation_type === EStoryRelationType.BlockedBy
          ? [r.related_story_id, r.story_id]
          : [null, null];
    if (!blockerId || !blockedId || !ids.has(blockedId)) continue;
    if (byId.get(blockerId)?.status === EStoryStatus.Done) continue;
    blocked.add(blockedId);
  }
  for (const t of tasks) t.gn_blocked = blocked.has(t.id);

  return { data: tasks, links: relationsToLinks(relations, ids) };
}

/**
 * Inverse map: a dhtmlx task the user dragged/resized → the story date patch to
 * persist. dhtmlx `end_date` is exclusive (the day after the bar), so the stored
 * inclusive due date is `end_date - 1 day`.
 */
export function taskToDatePatch(task: {
  start_date: Date | string;
  end_date: Date | string;
}): { start_date: string; target_date: string } {
  const start = toIsoDay(task.start_date);
  const endExclusive = toIsoDay(task.end_date);
  return { start_date: start, target_date: addDays(endExclusive, -1) };
}

function toIsoDay(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return toDayString(value) ?? value.slice(0, 10);
}
