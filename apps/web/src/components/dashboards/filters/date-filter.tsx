"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Calendar03Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATE_RANGE_LABELS } from "@/constants/dashboard-date-ranges";
import { dateFilterLabel, type TDateFilter } from "@/lib/dashboards/date-filter-label";
import { cn } from "@/lib/utils";
import { EWidgetDateRange } from "@/types";

const PRESETS = [
  EWidgetDateRange.All,
  EWidgetDateRange.Last7,
  EWidgetDateRange.Last30,
  EWidgetDateRange.Last90,
  EWidgetDateRange.Custom,
];

const INPUT =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Optional date window for the whole dashboard. Presets resolve against today
 * on every load (a saved "last 30 days" keeps meaning the last 30 days); a
 * custom range is stored as fixed days, either end optional.
 */
export function DateFilter({
  value,
  onChange,
}: {
  value: TDateFilter;
  onChange: (next: TDateFilter) => void;
}) {
  const range = value.date_range ?? EWidgetDateRange.All;
  const label = dateFilterLabel(value);

  const pick = (next: EWidgetDateRange) =>
    // Custom keeps any days already typed so toggling presets doesn't lose them.
    onChange(
      next === EWidgetDateRange.Custom
        ? { ...value, date_range: next }
        : { date_range: next === EWidgetDateRange.All ? undefined : next },
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-active={range !== EWidgetDateRange.All || undefined}
          className="gn-filter-trigger gap-2"
        >
          <HugeiconsIcon icon={Calendar03Icon} className="size-4 text-muted-foreground" />
          <span key={label} className="t-label-swap tabular-nums">
            {label}
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 origin-(--radix-popover-content-transform-origin) p-1"
      >
        <div role="radiogroup" aria-label="Date range" className="flex flex-col">
          {PRESETS.map((preset) => {
            const active = preset === range;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pick(preset)}
                className={cn(
                  "flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors duration-150",
                  "hover:bg-accent focus-visible:bg-accent",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {DATE_RANGE_LABELS[preset]}
                {active ? (
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
                ) : null}
              </button>
            );
          })}
        </div>

        {range === EWidgetDateRange.Custom ? (
          <div className="t-detail-swap mt-1 grid grid-cols-2 gap-2 border-t px-2 pt-2.5 pb-1.5">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">From</span>
              <input
                type="date"
                value={value.date_from ?? ""}
                max={value.date_to || undefined}
                onChange={(e) => onChange({ ...value, date_from: e.target.value || undefined })}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">To</span>
              <input
                type="date"
                value={value.date_to ?? ""}
                min={value.date_from || undefined}
                onChange={(e) => onChange({ ...value, date_to: e.target.value || undefined })}
                className={INPUT}
              />
            </label>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
