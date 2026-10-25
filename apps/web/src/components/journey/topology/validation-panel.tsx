import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { ITopologyIssue } from "@/lib/journey/topology";

/** Validation results — errors block readiness, warnings can be acknowledged. */
export function ValidationPanel({
  issues,
  onSelect,
}: {
  issues: ITopologyIssue[];
  onSelect: (id: string) => void;
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Validation</h2>
        <span className="text-xs text-muted-foreground">
          {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
        </span>
      </div>

      {issues.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
          Topology is valid.
        </p>
      ) : (
        <ul className="space-y-1">
          {[...errors, ...warnings].map((issue) => (
            <li key={issue.message}>
              <button
                type="button"
                onClick={() => issue.layerId && onSelect(issue.layerId)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                  issue.layerId ? "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none" : "cursor-default",
                )}
              >
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  className={cn("mt-0.5 size-3.5 shrink-0", issue.severity === "error" ? "text-red-500" : "text-amber-500")}
                />
                <span className="text-foreground">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
