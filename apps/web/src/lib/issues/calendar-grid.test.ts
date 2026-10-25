import { describe, expect, it } from "vitest";

import {
  CALENDAR_CELLS,
  calendarGridRange,
  calendarGridStart,
  toDayKey,
} from "./calendar-grid";

/** The month range the query used to use — kept here to assert the bug it caused. */
function monthOnlyRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(last).padStart(2, "0")}` };
}

describe("calendarGridStart", () => {
  it("starts on the Sunday on or before the 1st", () => {
    // 2026-08-01 is a Saturday, so the grid opens on Sunday 2026-07-26.
    expect(toDayKey(calendarGridStart("2026-08"))).toBe("2026-07-26");
  });

  it("starts on the 1st when the 1st is already a Sunday", () => {
    // 2026-03-01 is a Sunday — no trailing days from February.
    expect(toDayKey(calendarGridStart("2026-03"))).toBe("2026-03-01");
  });
});

describe("calendarGridRange", () => {
  it("covers every cell the grid draws", () => {
    const { from, to } = calendarGridRange("2026-08");
    const start = calendarGridStart("2026-08");
    const last = new Date(start);
    last.setDate(start.getDate() + CALENDAR_CELLS - 1);
    expect(from).toBe(toDayKey(start));
    expect(to).toBe(toDayKey(last));
  });

  it("reaches days the month-only range excluded — the missing-items bug", () => {
    // Every visible out-of-month cell was structurally empty: the grid drew it,
    // the query never asked for it. A due date on 2026-07-31 belongs to a cell
    // in August's grid, and only the wider range fetches it.
    const grid = calendarGridRange("2026-08");
    const monthOnly = monthOnlyRange("2026-08");
    expect(grid.from < monthOnly.from).toBe(true);
    expect(grid.to > monthOnly.to).toBe(true);
    expect(grid.from <= "2026-07-31" && "2026-07-31" <= grid.to).toBe(true);
    expect(monthOnly.from <= "2026-07-31").toBe(false);
  });

  it("spans exactly 42 days for any month", () => {
    for (const key of ["2026-01", "2026-02", "2026-03", "2026-08", "2026-11", "2027-02"]) {
      const { from, to } = calendarGridRange(key);
      const [fy, fm, fd] = from.split("-").map(Number);
      const [ty, tm, td] = to.split("-").map(Number);
      const days =
        (Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000 + 1;
      expect(days).toBe(CALENDAR_CELLS);
    }
  });
});

describe("toDayKey", () => {
  it("uses local time, so a late-evening date does not slip to the next day", () => {
    // `toISOString()` would render this as the 2nd for anyone east of UTC.
    expect(toDayKey(new Date(2026, 7, 1, 23, 30))).toBe("2026-08-01");
  });
});
