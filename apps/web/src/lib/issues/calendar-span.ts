import type { IStory } from "@/types";

/**
 * Span placement: a work item drawn as a bar across the days it covers.
 *
 * The single-day bases (`calendar-placement.ts`) answer "what is due today".
 * This answers "what is in flight this week", which a day map cannot express —
 * an item running the 3rd to the 17th appeared only on the 17th, so its
 * duration was invisible even though both dates were on the record.
 *
 * Kept apart from the day-map module because the outputs are different shapes
 * for different renderers, not two flavours of one thing.
 */

/** One drawn piece of a span, clipped to a single week row. */
export interface ISpanSegment {
  story: IStory;
  /** Column 0-6 (Sun-Sat) where the piece starts in this row. */
  startCol: number;
  /** Column 0-6 where it ends, inclusive. */
  endCol: number;
  /** Vertical lane within the row; 0 is nearest the date numbers. */
  lane: number;
  /** The span began before this row — draw a flat left edge, not a cap. */
  continuesLeft: boolean;
  /** The span continues after this row — draw a flat right edge. */
  continuesRight: boolean;
}

export interface ISpanWeekRow {
  /** The 7 day keys this row covers, for aligning against the day cells. */
  days: string[];
  segments: ISpanSegment[];
  /** Spans that overlapped past the lane cap. Reported, never silently dropped. */
  hiddenCount: number;
}

const DAYS_PER_WEEK = 7;

/**
 * The inclusive day range an item covers, or null when it has no dates.
 *
 * One date means a single day rather than an open-ended bar: the other end is
 * genuinely unknown, and inventing one would draw a commitment nobody made.
 * A due date before the start date is bad data, not a negative-width bar — it
 * collapses to the start day.
 */
export function spanRange(story: IStory): { from: string; to: string } | null {
  const start = story.start_date?.slice(0, 10) ?? null;
  const due = story.target_date?.slice(0, 10) ?? null;
  if (!start && !due) return null;
  if (!start) return { from: due!, to: due! };
  if (!due) return { from: start, to: start };
  return due < start ? { from: start, to: start } : { from: start, to: due };
}

/**
 * Lay every item out across the grid's week rows.
 *
 * `gridDays` is the 42 keys from `calendarGridStart` — the same array the day
 * cells render, so a bar and its dates cannot disagree about which column a day
 * is. `maxLanes` bounds a row's height; anything past it is counted, not lost.
 */
export function placeBySpan(
  stories: IStory[],
  gridDays: string[],
  maxLanes: number,
): ISpanWeekRow[] {
  const rowCount = Math.ceil(gridDays.length / DAYS_PER_WEEK);
  const rows: ISpanWeekRow[] = Array.from({ length: rowCount }, (_, r) => ({
    days: gridDays.slice(r * DAYS_PER_WEEK, (r + 1) * DAYS_PER_WEEK),
    segments: [],
    hiddenCount: 0,
  }));
  if (!gridDays.length) return rows;

  const gridFrom = gridDays[0]!;
  const gridTo = gridDays[gridDays.length - 1]!;
  const indexOfDay = new Map(gridDays.map((d, i) => [d, i]));

  // Sorted so lane assignment is deterministic: the same set always packs the
  // same way, or bars would jump lanes between renders for no visible reason.
  const ranged: { story: IStory; from: string; to: string }[] = [];
  for (const story of stories) {
    const range = spanRange(story);
    // One pass: derive the range and reject anything outside the grid together,
    // rather than building an intermediate array only to filter most of it away.
    if (!range || range.to < gridFrom || range.from > gridTo) continue;
    ranged.push({ story, ...range });
  }
  ranged.sort((a, b) =>
    a.from === b.from ? a.story.order - b.story.order : a.from < b.from ? -1 : 1,
  );

  // Lane occupancy per row: lane -> the last column it is filled through.
  const laneEnd: number[][] = rows.map(() => []);

  for (const { story, from, to } of ranged) {
    // Clip to the grid, then walk the rows it touches.
    const startIdx = indexOfDay.get(from) ?? 0;
    const endIdx = indexOfDay.get(to) ?? gridDays.length - 1;
    const firstRow = Math.floor(startIdx / DAYS_PER_WEEK);
    const lastRow = Math.floor(endIdx / DAYS_PER_WEEK);

    for (let r = firstRow; r <= lastRow; r += 1) {
      const rowStart = r * DAYS_PER_WEEK;
      const startCol = r === firstRow ? startIdx - rowStart : 0;
      const endCol = r === lastRow ? endIdx - rowStart : DAYS_PER_WEEK - 1;

      // Lowest lane free from this segment's first column onward.
      const ends = laneEnd[r]!;
      let lane = ends.findIndex((end) => end < startCol);
      if (lane === -1) lane = ends.length;

      if (lane >= maxLanes) {
        rows[r]!.hiddenCount += 1;
        continue;
      }
      ends[lane] = endCol;
      rows[r]!.segments.push({
        story,
        startCol,
        endCol,
        lane,
        // Clipping at the grid edge is also a continuation: the work really
        // does extend beyond what this month can show.
        continuesLeft: r > firstRow || from < gridFrom,
        continuesRight: r < lastRow || to > gridTo,
      });
    }
  }

  return rows;
}
