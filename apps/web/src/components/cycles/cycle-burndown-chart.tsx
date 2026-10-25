"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import {
  Area,
  ChartTooltip,
  ComposedChart,
  Grid,
  Line,
  XAxis,
  YAxis,
} from "@/components/charts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { IBurndownPoint } from "@/types";

/**
 * Cycle burn-down chart (Bklit `ComposedChart`). Renders scope as a shaded
 * area, the ideal trajectory as a dashed reference line, and the actual
 * pending count as a solid line that tracks work items still open.
 *
 * `pending` is `null` for days after "today" (see `IBurndownPoint`) — Bklit's
 * `Line`/`Area` series don't expose a `defined`/`connectNulls` prop, so those
 * future points render at the series' zero-pixel baseline rather than being
 * skipped. To avoid that spike, the `null` tail is forward-filled locally
 * (component-only — `src/lib/cycle-burndown.ts` keeps its `null`-after-today
 * semantics for other consumers) and rendered as a dashed projection from the
 * day after today so it still reads as "not real trend."
 */
export function CycleBurndownChart({ data }: { data: IBurndownPoint[] }) {
  // Forward-fill `pending` past "today" so Bklit doesn't drop those points
  // to the zero-pixel baseline; the filled tail is rendered dashed below.
  const todayIdx = data.findLastIndex((d) => d.pending !== null);
  // ComposedChart's data prop is intentionally loosely typed
  // (`Record<string, unknown>[]`) so it can host any series shape;
  // `IBurndownPoint` has no index signature, so it needs an explicit cast.
  const chartData = data.map((d, i) =>
    i > todayIdx && todayIdx >= 0 ? { ...d, pending: data[todayIdx].pending } : d,
  ) as unknown as Record<string, unknown>[];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Burn-down
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem disabled>Burn-down</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-muted-foreground">for</span>
        <span className="font-medium text-foreground">Work Items</span>
      </div>

      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] uppercase tracking-wide text-muted-foreground">
          Work Items
        </span>
        <div className="pl-5">
          <ComposedChart data={chartData} xDataKey="date" aspectRatio="16 / 7">
            <Grid horizontal />
            <Area dataKey="scope" fill="var(--chart-1)" fillOpacity={0.22} />
            <Line dataKey="ideal" stroke="var(--muted-foreground)" dashFromIndex={0} dashArray="4,4" />
            <Line
              dataKey="pending"
              stroke="var(--primary)"
              dashFromIndex={todayIdx + 1}
              dashArray="2,3"
            />
            <XAxis numTicks={6} />
            <YAxis />
            <ChartTooltip />
          </ComposedChart>
        </div>
      </div>
    </div>
  );
}

