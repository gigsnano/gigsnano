import { describe, expect, it } from "vitest";

import { EPlanTier } from "@/constants/plans";

import { computeSummary, isAvailable, meterState } from "./entitlement-summary";

describe("entitlement summary", () => {
  it("gates by min tier", () => {
    expect(isAvailable(EPlanTier.Free, "task_router")).toBe(false); // Business-only
    expect(isAvailable(EPlanTier.Business, "task_router")).toBe(true);
    expect(isAvailable(EPlanTier.Free, "smart_intake")).toBe(true); // Free
    expect(isAvailable(EPlanTier.Free, "unknown_key")).toBe(true); // uncatalogued = allowed
  });

  it("computes metered quota per tier", () => {
    const free = computeSummary(EPlanTier.Free, { agent_runs: 16 });
    const runs = free.find((e) => e.key === "agent_runs")!;
    expect(runs).toMatchObject({ metered: true, quota: 20, used: 16 });
    const business = computeSummary(EPlanTier.Business).find((e) => e.key === "agent_runs")!;
    expect(business.quota).toBeNull(); // unlimited on Business
  });

  it("classifies meter level", () => {
    expect(meterState(5, 20).level).toBe("ok");
    expect(meterState(16, 20).level).toBe("near"); // >= 80%
    expect(meterState(20, 20).level).toBe("over");
    expect(meterState(999, null)).toMatchObject({ unlimited: true, level: "ok" });
  });
});
