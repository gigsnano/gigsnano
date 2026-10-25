import { describe, expect, it } from "vitest";

import { cyclePhase } from "./cycle-phase";
import { ECycleStatus } from "@/types";

const NOW = new Date("2026-07-14T09:00:00Z");

function cycle(overrides: {
  status?: ECycleStatus;
  start_date?: string | null;
  end_date?: string | null;
}) {
  return {
    status: ECycleStatus.Draft,
    start_date: null,
    end_date: null,
    ...overrides,
  };
}

describe("cyclePhase", () => {
  it("is active when today falls within the date range — the GIN-81 bug", () => {
    // A draft-status cycle whose window contains today must show as Active.
    const phase = cyclePhase(
      cycle({ status: ECycleStatus.Draft, start_date: "2026-07-10", end_date: "2026-07-20" }),
      NOW,
    );
    expect(phase).toBe("active");
  });

  it("is upcoming when today is before the start date", () => {
    expect(
      cyclePhase(cycle({ start_date: "2026-07-20", end_date: "2026-07-30" }), NOW),
    ).toBe("upcoming");
  });

  it("is completed when today is past the end date", () => {
    expect(
      cyclePhase(cycle({ start_date: "2026-06-01", end_date: "2026-06-30" }), NOW),
    ).toBe("completed");
  });

  it("treats the start and end days as inclusive", () => {
    expect(
      cyclePhase(cycle({ start_date: "2026-07-14", end_date: "2026-07-14" }), NOW),
    ).toBe("active");
  });

  it("keeps an explicitly completed cycle completed even if today is in range", () => {
    expect(
      cyclePhase(
        cycle({ status: ECycleStatus.Completed, start_date: "2026-07-10", end_date: "2026-07-20" }),
        NOW,
      ),
    ).toBe("completed");
  });

  it("is active with only a start date in the past (open-ended cycle)", () => {
    expect(
      cyclePhase(cycle({ status: ECycleStatus.Active, start_date: "2026-05-20", end_date: null }), NOW),
    ).toBe("active");
  });

  it("is upcoming with only a start date in the future", () => {
    expect(
      cyclePhase(cycle({ start_date: "2026-08-01", end_date: null }), NOW),
    ).toBe("upcoming");
  });

  it("falls back to stored status when there are no dates", () => {
    expect(cyclePhase(cycle({ status: ECycleStatus.Active }), NOW)).toBe("active");
    expect(cyclePhase(cycle({ status: ECycleStatus.Draft }), NOW)).toBe("upcoming");
  });

  it("handles full ISO timestamps at day granularity", () => {
    expect(
      cyclePhase(
        cycle({ start_date: "2026-07-14T23:00:00Z", end_date: "2026-07-14T23:59:00Z" }),
        NOW,
      ),
    ).toBe("active");
  });
});
