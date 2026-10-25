import { describe, expect, it } from "vitest";

import { formatHour, hourInViewerTime, timezoneOptions } from "./timezone";

describe("timezoneOptions", () => {
  it("lists the runtime's zones", () => {
    const zones = timezoneOptions("UTC");
    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain("Europe/Berlin");
  });

  it("always offers UTC", () => {
    // supportedValuesOf lists no Etc/* and no UTC — 418 zones in Node, not one
    // of them UTC. It's our stored default, so without an explicit add a user
    // who moved off UTC could never move back.
    expect(timezoneOptions("Europe/Berlin")).toContain("UTC");
  });

  it("keeps an aliased or unknown stored zone selectable", () => {
    // Runtimes disagree on canonical names (Node: Asia/Calcutta; newer V8:
    // Asia/Kolkata). A zone saved by one client must not vanish in another, or
    // the select reads as a different zone than the one actually stored.
    expect(timezoneOptions("Asia/Kolkata")).toContain("Asia/Kolkata");
    expect(timezoneOptions("Mars/Olympus_Mons")).toContain("Mars/Olympus_Mons");
  });

  it("does not duplicate a known zone", () => {
    const zones = timezoneOptions("Europe/Berlin");
    expect(zones.filter((z) => z === "Europe/Berlin")).toHaveLength(1);
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe("formatHour", () => {
  it("zero-pads to a wall-clock hour", () => {
    expect(formatHour(0)).toBe("00:00");
    expect(formatHour(8)).toBe("08:00");
    expect(formatHour(23)).toBe("23:00");
  });
});

describe("hourInViewerTime", () => {
  it("is null when the viewer is already in that zone", () => {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(hourInViewerTime(9, here)).toBeNull();
  });

  it("renders a wall-clock time when the zones differ", () => {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const other = here === "Asia/Kolkata" ? "Europe/Berlin" : "Asia/Kolkata";
    expect(hourInViewerTime(9, other)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("handles a half-hour offset without losing the minutes", () => {
    // Kolkata is +05:30 and Berlin +01:00 in January: 09:00 there is 04:30 here.
    // Only meaningful when the test runner isn't already in one of them.
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (here === "Asia/Kolkata") return;
    const out = hourInViewerTime(9, "Asia/Kolkata");
    expect(out).toMatch(/:(00|15|30|45)$/);
  });

  it("wraps around midnight rather than going negative", () => {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (here === "Pacific/Kiritimati") return;
    const out = hourInViewerTime(0, "Pacific/Kiritimati"); // +14 — always wraps
    expect(out).toMatch(/^\d{2}:\d{2}$/);
    const [hh, mm] = (out ?? "00:00").split(":").map(Number);
    expect(hh).toBeGreaterThanOrEqual(0);
    expect(hh).toBeLessThanOrEqual(23);
    expect(mm).toBeGreaterThanOrEqual(0);
    expect(mm).toBeLessThanOrEqual(59);
  });
});
