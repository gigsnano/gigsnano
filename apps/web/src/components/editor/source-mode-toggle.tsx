"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SourceCodeIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

export function SourceModeToggle({
  mode,
  onToggle,
  disabled,
}: {
  mode: "visual" | "source";
  onToggle: () => void;
  disabled?: boolean;
}) {
  const isSource = mode === "source";
  return (
    <button
      type="button"
      aria-pressed={isSource}
      aria-label={isSource ? "Edit visually" : "Edit as Markdown"}
      title={isSource ? "Edit visually (Ctrl+Shift+M)" : "Edit as Markdown (Ctrl+Shift+M)"}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        isSource ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
      )}
    >
      <HugeiconsIcon icon={SourceCodeIcon} className="size-3.5" />
      {isSource ? "Visual" : "Source"}
    </button>
  );
}
