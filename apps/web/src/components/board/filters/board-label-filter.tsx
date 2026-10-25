"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { IProjectLabel } from "@/types";

export function BoardLabelFilter({
  labels,
  value,
  onChange,
}: {
  labels: IProjectLabel[];
  value: string | null;
  onChange: (labelId: string | null) => void;
}) {
  if (labels.length === 0) return null;

  const active = value ? labels.find((l) => l.id === value) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-muted-foreground">Label</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "rounded-md px-2 py-1 text-xs transition-colors active:scale-[0.97]",
          value === null
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        All
      </button>
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          onClick={() => onChange(value === label.id ? null : label.id)}
          className={cn(
            "inline-flex max-w-[8rem] items-center gap-1 truncate rounded-md px-2 py-1 text-xs transition-colors active:scale-[0.97]",
            value === label.id ? "ring-1 ring-primary" : "hover:bg-accent/50",
          )}
          style={
            value === label.id
              ? { backgroundColor: `${label.color}25`, color: label.color }
              : undefined
          }
        >
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
          {label.name}
        </button>
      ))}
      {active ? (
        <button
          type="button"
          aria-label="Clear label filter"
          onClick={() => onChange(null)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/50 active:scale-[0.97]"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      ) : (
        <HugeiconsIcon icon={Tag01Icon} className="size-3.5 text-muted-foreground/50" />
      )}
    </div>
  );
}
