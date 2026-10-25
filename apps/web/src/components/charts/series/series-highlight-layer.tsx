"use client";

import { useChartStable } from "@/components/charts/context/chart-context";
import { HighlightSegment } from "@/components/charts/series/highlight-segment";
import { useHighlightSegment } from "@/components/charts/hooks/use-highlight-segment";

interface SeriesHighlightLayerProps {
  /** Caller already gated `showHighlight && showLine`; this just routes through. */
  enabled: boolean;
  height: number;
  /** Null until the stroke path is measured — there's nothing to highlight yet. */
  pathD: string | null;
  stroke: string;
  strokeWidth: number;
}

/**
 * Self-contained hover-highlight band over a series stroke.
 *
 * Owns the `useHighlightSegment` subscription (which reads both stable + hover
 * context) so the parent <Area> / <Line> can stay on the stable slice. This
 * component still re-renders on hover — that's the price of driving the
 * highlight band — but it's a tiny leaf so the cost is bounded to itself.
 */
export function SeriesHighlightLayer({
  enabled,
  height,
  pathD,
  stroke,
  strokeWidth,
}: SeriesHighlightLayerProps) {
  const { isLoaded } = useChartStable();
  const { xSpring, widthSpring, isActive } = useHighlightSegment({ enabled });
  if (pathD === null) return null; // no measured path yet → nothing to highlight
  return (
    <HighlightSegment
      height={height}
      pathD={pathD}
      stroke={stroke}
      strokeWidth={strokeWidth}
      visible={enabled && isActive && isLoaded}
      width={widthSpring}
      x={xSpring}
    />
  );
}

SeriesHighlightLayer.displayName = "SeriesHighlightLayer";
