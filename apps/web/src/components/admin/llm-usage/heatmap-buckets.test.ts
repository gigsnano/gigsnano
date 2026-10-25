import { describe, expect, it } from "vitest";

import { getHeatmapBucket, getHeatmapBucketVarName } from "./heatmap-buckets";

describe("getHeatmapBucket", () => {
  it("returns zero for non-positive values", () => {
    expect(getHeatmapBucket(0, [10, 20, 30])).toBe(0);
    expect(getHeatmapBucket(-10, [10, 20, 30])).toBe(0);
  });

  it("maps values into five quantile levels", () => {
    const values = [10, 20, 30, 40, 50];
    expect(getHeatmapBucket(10, values)).toBe(0);
    expect(getHeatmapBucket(20, values)).toBe(1);
    expect(getHeatmapBucket(30, values)).toBe(2);
    expect(getHeatmapBucket(40, values)).toBe(3);
    expect(getHeatmapBucket(50, values)).toBe(4);
  });
});

describe("getHeatmapBucketVarName", () => {
  it("maps bucket to chart scale css vars", () => {
    expect(getHeatmapBucketVarName(0)).toBe("--chart-scale-01");
    expect(getHeatmapBucketVarName(1)).toBe("--chart-scale-02");
    expect(getHeatmapBucketVarName(2)).toBe("--chart-scale-03");
    expect(getHeatmapBucketVarName(3)).toBe("--chart-scale-04");
    expect(getHeatmapBucketVarName(4)).toBe("--chart-scale-05");
  });
});
