"use client";

import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { ParentSize } from "@visx/responsive";

import type { IComplexityBucket } from "@/types";
import { findThresholdBucketIndex } from "@/lib/code/metrics-shape";

const MARGIN = { top: 12, right: 16, bottom: 28, left: 32 };
/** CCN at/above which a function is generally considered hard to maintain. */
const CCN_THRESHOLD = 10;

/** Functions per CCN bucket, with a marker at the "complex" threshold. */
export function ComplexityHistogram({ buckets }: { buckets: IComplexityBucket[] }) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const thresholdIndex = findThresholdBucketIndex(buckets, CCN_THRESHOLD);

  return (
    <div className="h-56 w-full">
      <ParentSize debounceTime={10}>
        {({ width, height }) => {
          const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
          const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
          const xScale = scaleBand({
            domain: buckets.map((b) => b.range),
            range: [0, innerWidth],
            padding: 0.3,
          });
          const yScale = scaleLinear({ domain: [0, maxCount], range: [innerHeight, 0] });
          const thresholdX = xScale(buckets[thresholdIndex]?.range ?? "") ?? innerWidth;

          return (
            <svg width={width} height={height} role="img" aria-label="Function complexity histogram">
              <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
                <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="var(--chart-grid)" />
                {buckets.map((b) => {
                  const barWidth = xScale.bandwidth();
                  const barHeight = innerHeight - (yScale(b.count) ?? 0);
                  const x = xScale(b.range) ?? 0;
                  return (
                    <g key={b.range}>
                      <title>
                        CCN {b.range}: {b.count} functions
                      </title>
                      <Bar
                        x={x}
                        y={innerHeight - barHeight}
                        width={barWidth}
                        height={barHeight}
                        rx={3}
                        fill="var(--chart-1)"
                      />
                      <text
                        x={x + barWidth / 2}
                        y={innerHeight + 16}
                        textAnchor="middle"
                        className="fill-muted-foreground text-[10px]"
                      >
                        {b.range}
                      </text>
                    </g>
                  );
                })}
                {thresholdIndex < buckets.length ? (
                  <g>
                    <line
                      x1={thresholdX}
                      x2={thresholdX}
                      y1={0}
                      y2={innerHeight}
                      stroke="var(--destructive)"
                      strokeDasharray="4,3"
                    />
                    <text
                      x={thresholdX}
                      y={-2}
                      textAnchor="middle"
                      className="fill-destructive text-[10px] font-medium"
                    >
                      CCN ≥ {CCN_THRESHOLD}
                    </text>
                  </g>
                ) : null}
              </g>
            </svg>
          );
        }}
      </ParentSize>
    </div>
  );
}
