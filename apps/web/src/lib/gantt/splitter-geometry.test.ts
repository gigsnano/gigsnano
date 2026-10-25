import { describe, expect, it } from "vitest";

import {
  GANTT_MIN_BACKLOG,
  GANTT_MIN_TIMELINE,
  clampTimelineHeight,
} from "./splitter-geometry";

describe("clampTimelineHeight", () => {
  const available = 800;

  it("keeps a comfortable drag position untouched", () => {
    expect(clampTimelineHeight(420, available)).toBe(420);
  });

  it("never lets the timeline be dragged below its minimum", () => {
    expect(clampTimelineHeight(0, available)).toBe(GANTT_MIN_TIMELINE);
    expect(clampTimelineHeight(-500, available)).toBe(GANTT_MIN_TIMELINE);
  });

  it("always leaves room for the backlog", () => {
    expect(clampTimelineHeight(available, available)).toBe(available - GANTT_MIN_BACKLOG);
  });

  it("prefers the timeline minimum when the shell is too short for both", () => {
    // A short viewport can't satisfy both minimums; the timeline wins rather
    // than collapsing to a sliver of unusable chart.
    expect(clampTimelineHeight(999, 200)).toBe(GANTT_MIN_TIMELINE);
  });

  it("rounds to whole pixels so the style value never jitters sub-pixel", () => {
    expect(clampTimelineHeight(420.6, available)).toBe(421);
  });
});
