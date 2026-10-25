import { describe, expect, it } from "vitest";

import { HEALTH_DISPLAY, isAtRisk } from "./health";

describe("health", () => {
  it("labels every backend health value", () => {
    expect(HEALTH_DISPLAY).toEqual({
      on_track: { label: "On track", tone: "success" },
      at_risk: { label: "At risk", tone: "warning" },
      off_track: { label: "Off track", tone: "destructive" },
      no_data: { label: "No forecast", tone: "muted" },
    });
  });

  it("counts at_risk and off_track as at risk", () => {
    expect(["on_track", "at_risk", "off_track", "no_data"].map((h) => isAtRisk(h as never))).toEqual([
      false, true, true, false,
    ]);
  });
});
