"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TColumnFilterKind = "multi" | "text" | "dateRange";

export interface IColumnFilterFieldMeta {
  key: string;
  label: string;
  kind: TColumnFilterKind;
}

export type TColumnFilterValue =
  | string[]
  | string
  | { from: string | null; to: string | null };

/** Reusable column-header filter popover — multi-select, text, or date range. */
export function ColumnFilterControl({
  field,
  value,
  options = [],
  activeCount,
  onChange,
}: {
  field: IColumnFilterFieldMeta;
  value: TColumnFilterValue;
  options?: { value: string; label: string; icon?: ReactNode }[];
  activeCount: number;
  onChange: (next: TColumnFilterValue) => void;
}): ReactNode {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Filter by ${field.label}`}
          className={cn(
            "relative shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]",
            activeCount > 0 && "text-foreground",
          )}
        >
          <HugeiconsIcon icon={FilterIcon} className="size-3.5" />
          {activeCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-56 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">{field.label}</div>
        {field.kind === "multi" ? (
          <MultiFilterBody value={value as string[]} options={options} onChange={onChange} />
        ) : null}
        {field.kind === "text" ? (
          <TextFilterBody value={value as string} onChange={onChange} />
        ) : null}
        {field.kind === "dateRange" ? (
          <DateRangeFilterBody
            value={value as { from: string | null; to: string | null }}
            onChange={onChange}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MultiFilterBody({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: { value: string; label: string; icon?: ReactNode }[];
  onChange: (next: TColumnFilterValue) => void;
}) {
  const selected = new Set(value);

  return (
    <div className="max-h-60 overflow-y-auto py-1">
      {options.map((opt) => (
        <FacetRow
          key={opt.value}
          selected={selected.has(opt.value)}
          onClick={() => {
            const next = selected.has(opt.value)
              ? value.filter((v) => v !== opt.value)
              : [...value, opt.value];
            onChange(next);
          }}
          icon={opt.icon}
          label={opt.label}
        />
      ))}
    </div>
  );
}

function TextFilterBody({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: TColumnFilterValue) => void;
}) {
  return (
    <div className="p-3">
      <Input
        type="search"
        value={value}
        placeholder="Contains…"
        aria-label="Filter text"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function DateRangeFilterBody({
  value,
  onChange,
}: {
  value: { from: string | null; to: string | null };
  onChange: (next: TColumnFilterValue) => void;
}) {
  return (
    <div className="space-y-2 p-3">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">From</span>
        <Input
          type="date"
          value={value.from ?? ""}
          onChange={(e) =>
            onChange({ ...value, from: e.target.value || null })
          }
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">To</span>
        <Input
          type="date"
          value={value.to ?? ""}
          onChange={(e) => onChange({ ...value, to: e.target.value || null })}
        />
      </label>
    </div>
  );
}

function FacetRow({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/60"
    >
      <span className="flex w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {selected ? <HugeiconsIcon icon={Tick02Icon} className="size-3" /> : null}
      </span>
    </button>
  );
}
