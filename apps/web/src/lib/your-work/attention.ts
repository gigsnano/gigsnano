import { EStoryStatus, EStoryPriority, type IStory } from "@/types";
import { PRIORITY_WEIGHT } from "@/constants/story-meta";

/**
 * Deterministic "Your Work" Focus model (GIN-419).
 *
 * Transparent rules over the fields a story actually carries — no opaque AI
 * score. Each open item lands in exactly one section, highest-urgency wins.
 *
 * ponytail: attention triggers that need data `IStory` doesn't carry yet
 * (blocked-by relations, failed agent runs, approvals, unread mentions) are
 * deliberately out — add them here as those fields arrive, and the sections
 * re-rank for free.
 */
export enum EFocusSection {
  NeedsAttention = "needs_attention",
  Upcoming = "upcoming",
  Delegated = "delegated",
  Later = "later",
}

export const FOCUS_SECTION_ORDER: EFocusSection[] = [
  EFocusSection.NeedsAttention,
  EFocusSection.Upcoming,
  EFocusSection.Delegated,
  EFocusSection.Later,
];

export const FOCUS_SECTION_LABEL: Record<EFocusSection, string> = {
  [EFocusSection.NeedsAttention]: "Needs attention",
  [EFocusSection.Upcoming]: "Upcoming",
  [EFocusSection.Delegated]: "Waiting / Delegated",
  [EFocusSection.Later]: "Later",
};

export interface IFocusItem<T extends IStory = IStory> {
  story: T;
  section: EFocusSection;
  /** Human-readable urgency reason; only set for NeedsAttention items. */
  reason: string | null;
  /** Lower = more urgent. Sort key within a section. */
  rank: number;
}

export interface IFocusSection<T extends IStory = IStory> {
  section: EFocusSection;
  items: IFocusItem<T>[];
}

export interface IFocusSummary {
  needAttention: number;
  overdue: number;
  dueToday: number;
}

export interface IFocusResult<T extends IStory = IStory> {
  sections: IFocusSection<T>[];
  summary: IFocusSummary;
}

const DAY_MS = 86_400_000;

/** Whole-day difference of a date-only `YYYY-MM-DD` from `now`. Negative = past. */
export function daysUntil(dateStr: string, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const due = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return Math.round((due - today) / DAY_MS);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

/** Due-date chip descriptor (label + semantic tone). Color is never the only signal. */
export function dueDescriptor(
  target: string | null,
  now: Date,
): { label: string; tone: DueTone } {
  if (!target) return { label: "No date", tone: "none" };
  const d = daysUntil(target, now);
  if (d < 0) return { label: `Overdue ${plural(-d, "day")}`, tone: "overdue" };
  if (d === 0) return { label: "Due today", tone: "today" };
  if (d === 1) return { label: "Due tomorrow", tone: "soon" };
  if (d <= 7) return { label: `Due in ${plural(d, "day")}`, tone: "soon" };
  return { label: `Due in ${plural(d, "day")}`, tone: "later" };
}

/** Classify one open story → section + reason + rank. */
function classify(story: IStory, now: Date): IFocusItem {
  const pw = PRIORITY_WEIGHT[story.priority];
  const d = story.target_date ? daysUntil(story.target_date, now) : null;

  // Tier 0..3 → Needs attention (lower tier = more urgent). null = not attention.
  let tier: number | null = null;
  let reason: string | null = null;

  if (d !== null && d < 0) {
    tier = 0;
    reason = `Overdue by ${plural(-d, "day")}`;
  } else if (d === 0) {
    tier = 1;
    reason = "Due today";
  } else if (story.priority === EStoryPriority.Urgent) {
    tier = 2;
    reason = "Urgent priority";
  } else if (story.priority === EStoryPriority.High && d !== null && d <= 7) {
    tier = 3;
    reason = `High priority · due in ${plural(d, "day")}`;
  }

  if (tier !== null) {
    // Within Needs attention: tier, then priority desc, then soonest due, then id.
    const rank = tier * 1000 - pw * 100 + (d ?? 0);
    return { story, section: EFocusSection.NeedsAttention, reason, rank };
  }

  if (d !== null && d >= 1 && d <= 7) {
    return { story, section: EFocusSection.Upcoming, reason: null, rank: d * 100 - pw };
  }

  if (story.ai_agent_id) {
    return { story, section: EFocusSection.Delegated, reason: null, rank: -pw };
  }

  // Later: dated items first (by date), then undated, priority desc as tiebreak.
  const rank = (d ?? 100_000) * 100 - pw;
  return { story, section: EFocusSection.Later, reason: null, rank };
}

/**
 * Build the Focus view from a member's open work items.
 * Sections are returned in fixed order, empty ones omitted, items rank-sorted.
 */
export function buildFocus<T extends IStory>(stories: T[], now: Date): IFocusResult<T> {
  const buckets = new Map<EFocusSection, IFocusItem<T>[]>();
  let overdue = 0;
  let dueToday = 0;

  for (const story of stories) {
    if (story.status === EStoryStatus.Done) continue;
    const item = classify(story, now) as IFocusItem<T>;
    const list = buckets.get(item.section) ?? [];
    list.push(item);
    buckets.set(item.section, list);

    if (story.target_date) {
      const d = daysUntil(story.target_date, now);
      if (d < 0) overdue += 1;
      else if (d === 0) dueToday += 1;
    }
  }

  const sections: IFocusSection<T>[] = [];
  for (const section of FOCUS_SECTION_ORDER) {
    const items = buckets.get(section);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.rank - b.rank || a.story.updated_at.localeCompare(b.story.updated_at) * -1);
    sections.push({ section, items });
  }

  const needAttention = buckets.get(EFocusSection.NeedsAttention)?.length ?? 0;
  return { sections, summary: { needAttention, overdue, dueToday } };
}
