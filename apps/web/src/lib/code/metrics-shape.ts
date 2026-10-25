import type { IComplexityBucket, IHotspot, ILanguageLoc } from "@/types";

/** Parses a CCN bucket's `range` label ("1-5", "31+") into its lower bound. */
function bucketLowerBound(range: string): number {
  const n = parseInt(range, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Index of the first bucket at/above `threshold` CCN — where the histogram's
 * "complex function" threshold marker should be drawn. Returns
 * `buckets.length` (off the right edge) when every bucket is below it. */
export function findThresholdBucketIndex(buckets: IComplexityBucket[], threshold = 10): number {
  const idx = buckets.findIndex((b) => bucketLowerBound(b.range) >= threshold);
  return idx === -1 ? buckets.length : idx;
}

export interface ITreemapRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ITreemapItem {
  id: string;
  value: number;
}

/**
 * Binary slice-and-dice treemap: recursively splits the remaining rect at the
 * point closest to 50% of cumulative value, alternating the cut axis each
 * level. Not a squarified layout (tiles can get thin for wide value spreads),
 * but it's area-correct and simple enough to hand-verify for a top-30 list.
 */
export function computeTreemapLayout(
  items: ITreemapItem[],
  width: number,
  height: number,
): ITreemapRect[] {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (items.length === 0 || width <= 0 || height <= 0 || total <= 0) return [];
  return slice(items.filter((i) => i.value > 0), 0, 0, width, height, width >= height);
}

function slice(
  items: ITreemapItem[],
  x: number,
  y: number,
  w: number,
  h: number,
  horizontal: boolean,
): ITreemapRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ id: items[0].id, x, y, w, h }];
  }

  const total = items.reduce((sum, i) => sum + i.value, 0);
  let cumulative = 0;
  let splitAt = 1;
  for (let i = 0; i < items.length; i++) {
    cumulative += items[i].value;
    if (cumulative >= total / 2) {
      splitAt = i + 1;
      break;
    }
  }
  // Never let one half swallow every item (keeps recursion progressing).
  splitAt = Math.min(Math.max(splitAt, 1), items.length - 1);

  const left = items.slice(0, splitAt);
  const right = items.slice(splitAt);
  const leftTotal = left.reduce((sum, i) => sum + i.value, 0);
  const frac = leftTotal / total;

  if (horizontal) {
    const leftW = w * frac;
    return [
      ...slice(left, x, y, leftW, h, false),
      ...slice(right, x + leftW, y, w - leftW, h, false),
    ];
  }
  const topH = h * frac;
  return [
    ...slice(left, x, y, w, topH, true),
    ...slice(right, x, y + topH, w, h - topH, true),
  ];
}

export type TScatterQuadrant = "act-now" | "complex" | "churn" | "stable";

export interface IScatterPoint {
  file: string;
  churn: number;
  complexity: number;
  /** Area-proportional bubble radius (px) scaled from the hotspot score. */
  radius: number;
  quadrant: TScatterQuadrant;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MIN_RADIUS = 4;
const MAX_RADIUS = 18;

/** Maps hotspots onto the churn x complexity scatter, classifying each into
 * a quadrant against the set's own median churn/complexity (the "act now"
 * quadrant is high-churn AND high-complexity). Bubble radius uses a sqrt
 * scale so bubble AREA — not radius — is proportional to the hotspot score. */
export function churnComplexityPoints(hotspots: IHotspot[]): IScatterPoint[] {
  if (hotspots.length === 0) return [];
  const medianChurn = median(hotspots.map((h) => h.churn));
  const medianComplexity = median(hotspots.map((h) => h.complexity));
  const maxHotspot = Math.max(...hotspots.map((h) => h.hotspot), 0.0001);

  return hotspots.map((h) => {
    const highChurn = h.churn >= medianChurn;
    const highComplexity = h.complexity >= medianComplexity;
    const quadrant: TScatterQuadrant =
      highChurn && highComplexity
        ? "act-now"
        : highComplexity
          ? "complex"
          : highChurn
            ? "churn"
            : "stable";

    return {
      file: h.file,
      churn: h.churn,
      complexity: h.complexity,
      radius: MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(h.hotspot / maxHotspot),
      quadrant,
    };
  });
}

const DONUT_MAX_SLICES = 5;

export interface IDonutSlice {
  name: string;
  loc: number;
  percent: number;
}

/** Sorts languages by LOC desc and folds everything past the fixed
 * categorical palette (`--chart-1`..`--chart-5`) into one "Other" slice —
 * per the dataviz rule that a Nth series never gets a generated hue. */
export function languageDonutSlices(languages: ILanguageLoc[]): IDonutSlice[] {
  const total = languages.reduce((sum, l) => sum + l.loc, 0);
  if (total <= 0) return [];

  const sorted = [...languages].sort((a, b) => b.loc - a.loc);
  const head = sorted.slice(0, DONUT_MAX_SLICES);
  const tail = sorted.slice(DONUT_MAX_SLICES);
  const otherLoc = tail.reduce((sum, l) => sum + l.loc, 0);
  const slices = otherLoc > 0 ? [...head, { name: "Other", loc: otherLoc }] : head;

  return slices.map((s) => ({ ...s, percent: (s.loc / total) * 100 }));
}

// The app's existing chart ramp (`--chart-1` light → `--chart-5` dark, one hue
// family) doubles as the sequential heat scale — reusing it here rather than
// `--destructive` keeps that token reserved for actual status/critical UI
// (dataviz rule: status colors are never repurposed as a magnitude series).
const HEAT_STEPS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"] as const;

/** Sequential single-hue heat color (dataviz: sequential = one hue, light→dark)
 * for a hotspot score in [0,1], via native CSS `color-mix` between the two
 * nearest steps of the theme's `--chart-*` ramp — no hardcoded hex, works in
 * light + dark. */
export function hotspotHeatColor(score: number): string {
  const clamped = Math.min(1, Math.max(0, score));
  const scaled = clamped * (HEAT_STEPS.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, HEAT_STEPS.length - 1);
  if (lo === hi) return `var(${HEAT_STEPS[lo]})`;
  const pct = Math.round((scaled - lo) * 100);
  return `color-mix(in oklch, var(${HEAT_STEPS[hi]}) ${pct}%, var(${HEAT_STEPS[lo]}) ${100 - pct}%)`;
}
