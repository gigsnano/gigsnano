import { describe, it, expect } from "vitest";

import { deriveHealthStatus, HEALTH_STATUS_META, resolveHealthStatus } from "./health-status";

const base = { forecastable: true, p50_date: "2026-08-01T00:00:00Z", p85_date: "2026-08-15T00:00:00Z" };

describe("deriveHealthStatus", () => {
  it("is on_track when P85 lands on/before target", () => {
    expect(deriveHealthStatus({ ...base, targetDate: "2026-08-20" })).toBe("on_track");
    expect(deriveHealthStatus({ ...base, targetDate: "2026-08-15" })).toBe("on_track"); // boundary
  });

  it("is at_risk when target sits between P50 and P85", () => {
    expect(deriveHealthStatus({ ...base, targetDate: "2026-08-10" })).toBe("at_risk");
  });

  it("is off_track when target is before P50", () => {
    expect(deriveHealthStatus({ ...base, targetDate: "2026-07-25" })).toBe("off_track");
  });

  it("is no_target when forecastable but no target set", () => {
    expect(deriveHealthStatus({ ...base, targetDate: null })).toBe("no_target");
  });

  it("is no_data when not forecastable or dates missing", () => {
    expect(deriveHealthStatus({ forecastable: false, p50_date: null, p85_date: null, targetDate: "2026-08-20" })).toBe("no_data");
    expect(deriveHealthStatus({ ...base, p85_date: null, targetDate: "2026-08-20" })).toBe("no_data");
  });

  it("is no_data on unparseable dates", () => {
    expect(deriveHealthStatus({ ...base, p50_date: "not-a-date", targetDate: "2026-08-20" })).toBe("no_data");
  });

  it("every status has text-first meta (no colour-only meaning)", () => {
    for (const status of ["on_track", "at_risk", "off_track", "no_target", "no_data"] as const) {
      expect(HEALTH_STATUS_META[status].label).toBeTruthy();
      expect(HEALTH_STATUS_META[status].meaning).toBeTruthy();
    }
  });
});

describe("resolveHealthStatus", () => {
  it("passes through known backend statuses", () => {
    for (const s of ["on_track", "at_risk", "off_track", "no_data"] as const) {
      expect(resolveHealthStatus({ status: s, reasons: [] })).toBe(s);
    }
  });

  it("reads no_data + a no_target reason as no_target", () => {
    expect(resolveHealthStatus({ status: "no_data", reasons: [{ code: "no_target" }] })).toBe(
      "no_target",
    );
  });

  it("falls back to no_data for missing input or unknown status", () => {
    expect(resolveHealthStatus(undefined)).toBe("no_data");
    expect(resolveHealthStatus(null)).toBe("no_data");
    expect(resolveHealthStatus({ status: "bogus", reasons: [] })).toBe("no_data");
  });
});
