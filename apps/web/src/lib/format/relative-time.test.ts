import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const NOW = new Date("2026-08-01T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime — past", () => {
  it("says just now inside the first 45 seconds", () => {
    expect(relativeTime(at(-10 * SEC), NOW)).toBe("just now");
  });

  it("bands minutes, hours, days and weeks", () => {
    expect(relativeTime(at(-5 * MIN), NOW)).toBe("5m ago");
    expect(relativeTime(at(-3 * HOUR), NOW)).toBe("3h ago");
    expect(relativeTime(at(-2 * DAY), NOW)).toBe("2d ago");
    expect(relativeTime(at(-14 * DAY), NOW)).toBe("2w ago");
  });

  it("falls back to a date past five weeks", () => {
    expect(relativeTime(at(-200 * DAY), NOW)).toMatch(/\w/);
    expect(relativeTime(at(-200 * DAY), NOW)).not.toContain("ago");
  });
});

describe("relativeTime — future", () => {
  it("does NOT call a future date 'just now'", () => {
    // The bug: `now - then` is negative for a future date, and `sec < 45`
    // swallowed every negative value — so an invitation expiring in a week
    // rendered "expires just now" and read as already expired.
    expect(relativeTime(at(7 * DAY), NOW)).not.toBe("just now");
  });

  it("bands forwards with 'in' phrasing", () => {
    expect(relativeTime(at(5 * MIN), NOW)).toBe("in 5m");
    expect(relativeTime(at(3 * HOUR), NOW)).toBe("in 3h");
    expect(relativeTime(at(2 * DAY), NOW)).toBe("in 2d");
    expect(relativeTime(at(14 * DAY), NOW)).toBe("in 2w");
  });

  it("reads the real invitation case as a week away", () => {
    // 7-day TTL sent 5 hours ago → 6d19h out. That rounds to 7 days, and the
    // day band is `< 7`, so it steps up to weeks — the same way "7 days ago"
    // reads "1w ago". This is the string those three pending invitations now
    // show instead of "expires just now".
    expect(relativeTime(at(7 * DAY - 5 * HOUR), NOW)).toBe("in 1w");
  });

  it("distinguishes an imminent future from a recent past", () => {
    // "just now" is past-tense; something about to happen is not that.
    expect(relativeTime(at(10 * SEC), NOW)).toBe("in a moment");
    expect(relativeTime(at(-10 * SEC), NOW)).toBe("just now");
  });

  it("falls back to a date past five weeks ahead", () => {
    expect(relativeTime(at(200 * DAY), NOW)).not.toContain("in ");
  });
});
