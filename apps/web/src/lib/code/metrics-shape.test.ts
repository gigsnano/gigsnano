import { describe, expect, it } from "vitest";

import type { IComplexityBucket, IHotspot, ILanguageLoc } from "@/types";

import {
  churnComplexityPoints,
  computeTreemapLayout,
  findThresholdBucketIndex,
  hotspotHeatColor,
  languageDonutSlices,
} from "./metrics-shape";

describe("findThresholdBucketIndex", () => {
  const buckets: IComplexityBucket[] = [
    { range: "1-5", count: 10 },
    { range: "6-10", count: 5 },
    { range: "11-20", count: 2 },
    { range: "21-30", count: 1 },
  ];

  it("finds the first bucket at/above the threshold", () => {
    expect(findThresholdBucketIndex(buckets, 10)).toBe(2);
  });

  it("returns buckets.length when every bucket is below the threshold", () => {
    expect(findThresholdBucketIndex(buckets, 100)).toBe(buckets.length);
  });

  it("defaults the threshold to CCN 10", () => {
    expect(findThresholdBucketIndex(buckets)).toBe(2);
  });
});

describe("computeTreemapLayout", () => {
  it("returns an empty array for no items or a zero-size container", () => {
    expect(computeTreemapLayout([], 100, 100)).toEqual([]);
    expect(computeTreemapLayout([{ id: "a", value: 1 }], 0, 100)).toEqual([]);
  });

  it("gives a single item the full rect", () => {
    const rects = computeTreemapLayout([{ id: "a", value: 5 }], 200, 100);
    expect(rects).toEqual([{ id: "a", x: 0, y: 0, w: 200, h: 100 }]);
  });

  it("conserves total area across all rects (no gaps/overlaps by area sum)", () => {
    const items = [
      { id: "a", value: 10 },
      { id: "b", value: 6 },
      { id: "c", value: 3 },
      { id: "d", value: 1 },
    ];
    const rects = computeTreemapLayout(items, 300, 200);
    expect(rects).toHaveLength(items.length);
    const totalArea = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(totalArea).toBeCloseTo(300 * 200, 5);
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it("sizes a bigger-value item with more area than a smaller one", () => {
    const rects = computeTreemapLayout(
      [
        { id: "big", value: 9 },
        { id: "small", value: 1 },
      ],
      100,
      100,
    );
    const big = rects.find((r) => r.id === "big")!;
    const small = rects.find((r) => r.id === "small")!;
    expect(big.w * big.h).toBeGreaterThan(small.w * small.h);
  });
});

describe("churnComplexityPoints", () => {
  const hotspots: IHotspot[] = [
    { file: "a.ts", complexity: 30, churn: 40, hotspot: 1.0 },
    { file: "b.ts", complexity: 2, churn: 1, hotspot: 0.02 },
  ];

  it("returns empty for no hotspots", () => {
    expect(churnComplexityPoints([])).toEqual([]);
  });

  it("classifies the high-churn/high-complexity file as act-now", () => {
    const points = churnComplexityPoints(hotspots);
    const a = points.find((p) => p.file === "a.ts")!;
    expect(a.quadrant).toBe("act-now");
  });

  it("classifies the low-churn/low-complexity file as stable", () => {
    const points = churnComplexityPoints(hotspots);
    const b = points.find((p) => p.file === "b.ts")!;
    expect(b.quadrant).toBe("stable");
  });

  it("gives the higher-hotspot file a larger bubble radius", () => {
    const points = churnComplexityPoints(hotspots);
    const a = points.find((p) => p.file === "a.ts")!;
    const b = points.find((p) => p.file === "b.ts")!;
    expect(a.radius).toBeGreaterThan(b.radius);
  });
});

describe("languageDonutSlices", () => {
  it("returns empty for no languages", () => {
    expect(languageDonutSlices([])).toEqual([]);
  });

  it("computes percent shares that sum to ~100", () => {
    const languages: ILanguageLoc[] = [
      { name: "TS", loc: 75 },
      { name: "CSS", loc: 25 },
    ];
    const slices = languageDonutSlices(languages);
    const total = slices.reduce((s, x) => s + x.percent, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(slices.find((s) => s.name === "TS")!.percent).toBeCloseTo(75, 5);
  });

  it("folds languages past the 5th into a single 'Other' slice", () => {
    const languages: ILanguageLoc[] = Array.from({ length: 7 }, (_, i) => ({
      name: `Lang${i}`,
      loc: 10 - i,
    }));
    const slices = languageDonutSlices(languages);
    expect(slices).toHaveLength(6);
    const other = slices.find((s) => s.name === "Other")!;
    expect(other.loc).toBe(languages.slice(5).reduce((s, l) => s + l.loc, 0));
  });
});

describe("hotspotHeatColor", () => {
  it("clamps out-of-range scores into [0, 1]", () => {
    expect(hotspotHeatColor(-1)).toBe(hotspotHeatColor(0));
    expect(hotspotHeatColor(5)).toBe(hotspotHeatColor(1));
  });

  it("returns a different mix for a low vs a high score", () => {
    expect(hotspotHeatColor(0.1)).not.toBe(hotspotHeatColor(0.9));
  });
});
