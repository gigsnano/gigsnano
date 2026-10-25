import { describe, expect, it } from "vitest";

import { quickDueOptions } from "./due-dates";

const dates = (now: Date) => quickDueOptions(now).map((o) => o.date);

describe("quickDueOptions", () => {
  it("offers today, tomorrow, next Monday and none (Saturday 2026-10-17)", () => {
    expect(dates(new Date(2026, 9, 17))).toEqual(["2026-10-17", "2026-10-18", "2026-10-19", null]);
  });
  it("skips a full week when today is Monday", () => {
    expect(dates(new Date(2026, 9, 19))[2]).toBe("2026-10-26");
  });
  it("is the next day when today is Sunday", () => {
    expect(dates(new Date(2026, 9, 18))[2]).toBe("2026-10-19");
  });
  it("rolls over month and year ends", () => {
    expect(dates(new Date(2026, 11, 31)).slice(0, 2)).toEqual(["2026-12-31", "2027-01-01"]);
  });
});
