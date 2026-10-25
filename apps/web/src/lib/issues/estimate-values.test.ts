import { describe, it, expect } from "vitest";

import { DURATION_PRESETS_MIN, formatDuration, formatPoints, valuesForType } from "./estimate-values";

describe("valuesForType", () => {
  it("maps scale type to its value set", () => {
    expect(valuesForType("hours")).toContain(8);
    expect(valuesForType("days")).toContain(0.5);
    expect(valuesForType("points")).toContain(13);
  });
});

describe("formatPoints", () => {
  it("suffixes hours/days, bare points otherwise", () => {
    expect(formatPoints(8, "hours")).toBe("8h");
    expect(formatPoints(2, "days")).toBe("2d");
    expect(formatPoints(5, "points")).toBe("5");
  });
});

describe("formatDuration", () => {
  it("shows minutes under an hour", () => {
    expect(formatDuration(15)).toBe("15m");
    expect(formatDuration(45)).toBe("45m");
  });
  it("shows hours up to a workday, integers stay integer", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(240)).toBe("4h");
    expect(formatDuration(90)).toBe("1.5h");
  });
  it("shows workdays (8h) beyond a day", () => {
    expect(formatDuration(480)).toBe("1d");
    expect(formatDuration(2400)).toBe("5d");
  });
  it("every preset formats to a non-empty label", () => {
    for (const m of DURATION_PRESETS_MIN) expect(formatDuration(m)).toMatch(/\d+(\.\d)?[mhd]/);
  });
});
