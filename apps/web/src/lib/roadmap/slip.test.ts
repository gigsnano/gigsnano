import { describe, expect, it } from "vitest";

import { slipBand } from "./slip";

const TODAY = new Date("2026-07-18T00:00:00");

describe("slipBand", () => {
  it("is on_track with no work or all done", () => {
    expect(slipBand(0, 0, "2026-08-01", TODAY).signal).toBe("on_track");
    expect(slipBand(5, 5, "2026-08-01", TODAY).signal).toBe("on_track");
  });

  it("is off_track past the target date", () => {
    expect(slipBand(4, 1, "2026-07-10", TODAY).signal).toBe("off_track");
  });

  it("is at_risk when open items exceed days left", () => {
    // 10 open, 3 days left → at risk (~1 item/day capacity).
    expect(slipBand(10, 0, "2026-07-21", TODAY).signal).toBe("at_risk");
  });

  it("is on_track with comfortable runway", () => {
    // 2 open, 30 days left.
    expect(slipBand(5, 3, "2026-08-17", TODAY).signal).toBe("on_track");
  });
});
