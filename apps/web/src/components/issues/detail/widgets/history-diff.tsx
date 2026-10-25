"use client";

import { useState } from "react";

import { EStoryActivityField } from "@/types";
import { diffDescription } from "@/lib/diff/word-diff";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { cn } from "@/lib/utils";

export function HistoryDiff({
  field,
  oldValue,
  newValue,
}: {
  field: EStoryActivityField | null;
  oldValue: string;
  newValue: string;
}) {
  const [mode, setMode] = useState<"inline" | "split">("inline");

  if (field !== EStoryActivityField.Description) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="line-through decoration-muted-foreground/40">{oldValue || "—"}</span>{" "}
        → <span className="text-foreground">{newValue || "—"}</span>
      </p>
    );
  }

  return (
    <div className="mt-1.5 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
      <div className="mb-1.5 flex gap-1">
        {(["inline", "split"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
              mode === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "inline" ? "Inline" : "Side-by-side"}
          </button>
        ))}
      </div>
      {mode === "inline" ? (
        <p className="leading-relaxed">
          {diffDescription(oldValue, newValue).map((seg, i) => (
            <span
              key={i}
              className={cn(
                seg.added && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                seg.removed && "bg-red-500/15 text-red-700 line-through dark:text-red-300",
              )}
            >
              {seg.value}
            </span>
          ))}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="gn-prose max-w-none opacity-70" dangerouslySetInnerHTML={{ __html: sanitizeHtml(oldValue) || "<p>—</p>" }} />
          <div className="gn-prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(newValue) || "<p>—</p>" }} />
        </div>
      )}
    </div>
  );
}
