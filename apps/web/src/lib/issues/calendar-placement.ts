import type { IStory } from "@/types";

/**
 * Which date decides where an item sits on the calendar.
 *
 * `span` is defined here from the start so adding its renderer later is not a
 * second type change — but the Display control does not offer it until that
 * renderer exists. A control that offers a mode nothing can draw is worse than
 * one that offers two that work.
 */
export type TCalendarBasis = "due" | "start" | "span";

/** The ISO date field each single-day basis reads. */
const BASIS_FIELD: Record<"due" | "start", keyof Pick<IStory, "target_date" | "start_date">> = {
  due: "target_date",
  start: "start_date",
};

/**
 * The day an item occupies under a single-day basis, or null when it has no
 * such date.
 *
 * Omitting an undated item is correct and is NOT the bug fixed in PR #110:
 * there the item *had* the date and the grid dropped it anyway, because the
 * query asked for a narrower range than the grid drew. Here the item genuinely
 * has nothing to place it by, which is what the Dates control exists to let the
 * reader change.
 */
export function placementDay(story: IStory, basis: TCalendarBasis): string | null {
  if (basis === "span") return null; // slice 2 renders spans; nothing single-day to give
  const raw = story[BASIS_FIELD[basis]];
  // Slice rather than parse: the grid's keys are local `YYYY-MM-DD` from
  // `toDayKey`, and `new Date(iso).toISOString()` would shift the day either
  // side of midnight for anyone not on UTC.
  return raw ? raw.slice(0, 10) : null;
}

/** Day key → the items sitting on it, in input order. */
export function placeByDay(
  stories: IStory[],
  basis: TCalendarBasis,
): Map<string, IStory[]> {
  const map = new Map<string, IStory[]>();
  for (const story of stories) {
    const day = placementDay(story, basis);
    if (!day) continue;
    const onDay = map.get(day);
    if (onDay) onDay.push(story);
    else map.set(day, [story]);
  }
  return map;
}

/**
 * How many items the OTHER basis would place.
 *
 * Feeds the empty-state line: an empty grid must not read as "no work" when it
 * means "no work carrying this kind of date".
 */
export function countPlaceable(stories: IStory[], basis: TCalendarBasis): number {
  let n = 0;
  for (const story of stories) if (placementDay(story, basis)) n += 1;
  return n;
}
