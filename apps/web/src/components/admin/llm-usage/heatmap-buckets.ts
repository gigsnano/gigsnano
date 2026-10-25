export type THeatmapBucket = 0 | 1 | 2 | 3 | 4;

const CSS_VARS = [
  "--chart-scale-01",
  "--chart-scale-02",
  "--chart-scale-03",
  "--chart-scale-04",
  "--chart-scale-05",
] as const;

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const weight = index - low;
  const lowValue = sorted[low] ?? sorted[sorted.length - 1] ?? 0;
  const highValue = sorted[high] ?? sorted[sorted.length - 1] ?? lowValue;
  return lowValue + (highValue - lowValue) * weight;
}

export function getHeatmapBucket(value: number, values: number[]): THeatmapBucket {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const positives = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (positives.length === 0) return 0;

  const q20 = quantile(positives, 0.2);
  const q40 = quantile(positives, 0.4);
  const q60 = quantile(positives, 0.6);
  const q80 = quantile(positives, 0.8);

  if (value <= q20) return 0;
  if (value <= q40) return 1;
  if (value <= q60) return 2;
  if (value <= q80) return 3;
  return 4;
}

export function getHeatmapBucketVarName(bucket: THeatmapBucket) {
  return CSS_VARS[bucket];
}
