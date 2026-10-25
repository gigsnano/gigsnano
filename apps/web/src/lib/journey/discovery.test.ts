import { describe, expect, it } from "vitest";

import { seedDiscovery, baselineProgress, nextDiscoveryAction } from "./discovery";

describe("baselineProgress", () => {
  it("counts confirmed / unknown / attention on the seed", () => {
    const p = baselineProgress(seedDiscovery().evidence);
    expect(p.confirmedPct).toBe(67); // 4 of 6 confirmed
    expect(p.unknowns).toBe(1);
    expect(p.attention).toBe(1);
  });

  it("reaches 100% when every item is confirmed", () => {
    const all = seedDiscovery().evidence.map((e) => ({ ...e, status: "confirmed" as const }));
    expect(baselineProgress(all).confirmedPct).toBe(100);
  });
});

describe("nextDiscoveryAction", () => {
  it("prioritises attention, then unknown, then baseline approval", () => {
    const evidence = seedDiscovery().evidence;
    expect(nextDiscoveryAction(evidence)).toBe("Confirm mobile ownership");

    const noAttention = evidence.map((e) => (e.status === "attention" ? { ...e, status: "confirmed" as const } : e));
    expect(nextDiscoveryAction(noAttention)).toBe("Resolve production topology");

    const allResolved = noAttention.map((e) => ({ ...e, status: "confirmed" as const }));
    expect(nextDiscoveryAction(allResolved)).toBe("Approve the current-state baseline");
  });
});
