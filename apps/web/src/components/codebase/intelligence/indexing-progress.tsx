"use client";

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

const STAGES = ["Files parsed", "Symbols extracted", "Relationships generated", "Graph ready"];

/** Staged loader shown while the graph builds — reads calmer than a lone spinner. */
export function IndexingProgress({
  current = 2,
  filesDone,
  filesTotal,
}: {
  current?: number;
  filesDone?: number;
  filesTotal?: number;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-6">
      <ul className="w-56 space-y-2">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={s}
              className={cn(
                "flex items-center gap-2 text-sm",
                done || active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {done ? (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-emerald-500" />
              ) : active ? (
                <span
                  aria-hidden
                  className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
                />
              ) : (
                <span aria-hidden className="size-4 rounded-full border" />
              )}
              <span>{s}</span>
            </li>
          );
        })}
      </ul>
      {typeof filesDone === "number" && typeof filesTotal === "number" ? (
        <div className="text-xs tabular-nums text-muted-foreground">
          {filesDone} / {filesTotal} files processed
        </div>
      ) : null}
    </div>
  );
}
