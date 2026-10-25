"use client";

import { useSpring } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { useChartConfig } from "@/components/charts/context/chart-config-context";
import { useChartHover, useChartStable } from "@/components/charts/context/chart-context";
import {
  computeSegmentBounds,
  INACTIVE_SEGMENT,
} from "@/components/charts/utils/highlight-segment-bounds";

// Hover-highlight band for `line.tsx` and `area.tsx`. Computes the segment
// bounds and springs its x/width; `<HighlightSegment>` renders the clipped
// re-stroke. Spring tuning comes from `ChartConfigProvider.highlightSpring`.
// Stable + hover slices are read separately so callers can see the exact
// subscription surface (anything calling this hook will re-render on hover).

export interface HighlightSegmentResult {
  xSpring: ReturnType<typeof useSpring>;
  widthSpring: ReturnType<typeof useSpring>;
  isActive: boolean;
}

/**
 * @param enabled set false when there is no stroke to highlight (e.g. an area
 *   with `showLine={false}`); defaults true.
 */
export function useHighlightSegment({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): HighlightSegmentResult {
  const { data, xScale, xAccessor } = useChartStable();
  const { tooltipData, selection } = useChartHover();
  const { highlightSpring } = useChartConfig();

  const bounds = enabled
    ? computeSegmentBounds(data, xScale, xAccessor, tooltipData, selection)
    : INACTIVE_SEGMENT;

  const xSpring = useSpring(0, highlightSpring);
  const widthSpring = useSpring(0, highlightSpring);

  const wasActiveRef = useRef(false);

  useLayoutEffect(() => {
    if (bounds.isActive && !wasActiveRef.current) {
      xSpring.jump(bounds.x);
      widthSpring.jump(bounds.width);
    } else {
      xSpring.set(bounds.x);
      widthSpring.set(bounds.width);
    }
    wasActiveRef.current = bounds.isActive;
  }, [bounds.isActive, bounds.width, bounds.x, widthSpring, xSpring]);

  return { xSpring, widthSpring, isActive: bounds.isActive };
}
