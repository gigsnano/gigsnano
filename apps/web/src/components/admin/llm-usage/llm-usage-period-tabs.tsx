"use client";

import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { cn } from "@/lib/utils";

export type TLlmUsagePeriodPreset = "7d" | "30d" | "90d" | "mtd";

export interface ILlmUsageDateRange {
  from: string;
  to: string;
}

const PRESETS: { id: TLlmUsagePeriodPreset; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "mtd", label: "MTD" },
];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function rangeForPreset(preset: TLlmUsagePeriodPreset, now = new Date()): ILlmUsageDateRange {
  const to = now.toISOString();
  const fromDate = startOfUtcDay(now);
  if (preset === "mtd") {
    fromDate.setUTCDate(1);
    return { from: fromDate.toISOString(), to };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: fromDate.toISOString(), to };
}

export function llmUsageDefaultRange(now = new Date()): ILlmUsageDateRange {
  return rangeForPreset("30d", now);
}

interface ILlmUsagePeriodTabsProps {
  value: TLlmUsagePeriodPreset;
  disabled?: boolean;
  onChange: (preset: TLlmUsagePeriodPreset, range: ILlmUsageDateRange) => void;
}

export function LlmUsagePeriodTabs({ value, disabled = false, onChange }: ILlmUsagePeriodTabsProps) {
  const activeIndex = Math.max(
    0,
    PRESETS.findIndex((preset) => preset.id === value),
  );
  const { barRef, pillRef } = useSlidingTabs(activeIndex);

  return (
    <div ref={barRef} className="relative inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      <span
        ref={pillRef}
        className="pointer-events-none absolute inset-y-0.5 left-0 rounded-md bg-background shadow-sm"
        aria-hidden
      />
      {PRESETS.map((preset, index) => (
        <button
          key={preset.id}
          type="button"
          data-tab-index={index}
          disabled={disabled}
          onClick={() => onChange(preset.id, rangeForPreset(preset.id))}
          className={cn(
            "relative z-[1] rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === preset.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
