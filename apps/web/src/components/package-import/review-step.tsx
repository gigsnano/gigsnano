"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { EImportChangeStatus, type IImportPlan } from "@/types";

const TARGET_LABEL: Record<string, string> = {
  module: "Modules",
  milestone: "Milestones",
  cycle: "Cycles",
  epic: "Epics",
  story: "Stories",
  task: "Tasks",
  relation: "Dependencies",
  blocker: "Blockers",
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  excluded: "Excluded",
  needs_review: "Needs review",
  applied: "Applied",
  failed: "Failed",
  rolled_back: "Rolled back",
};

export function ReviewStep({
  plan,
  isDeciding,
  isApplying,
  error,
  onDecide,
  onApply,
}: {
  plan: IImportPlan;
  isDeciding: boolean;
  isApplying: boolean;
  error: string | null;
  onDecide: (decision: string, changeIds?: string[]) => void;
  onApply: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = [...checked];
  const approved = plan.counts_by_status.approved ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-medium text-foreground">Review what will be created</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing exists yet. Approve everything, or pick the items you want — only approved changes
          are created.
        </p>
      </header>

      {/* The impact summary stays visible while scrolling a long change set. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-background/95 px-3.5 py-2.5 backdrop-blur">
        {Object.entries(plan.counts_by_target).map(([target, count]) => (
          <span key={target} className="text-sm text-foreground">
            {count} <span className="text-muted-foreground">{TARGET_LABEL[target] ?? target}</span>
          </span>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {approved} of {plan.changes.length} approved
        </span>
      </div>

      {plan.blocking_conflicts.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Creation is blocked by {plan.blocking_conflicts.length} unresolved conflict
              {plan.blocking_conflicts.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {plan.blocking_conflicts.map((conflict) => (
                <li key={conflict.finding_id} className="text-sm text-muted-foreground">
                  <span className="text-foreground">{conflict.title}</span> — {conflict.anchor}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {plan.blocking_conflicts[0]?.resolution}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isDeciding}
          onClick={() => onDecide("approved")}
        >
          Approve all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isDeciding || selectedIds.length === 0}
          onClick={() => onDecide("approved", selectedIds)}
        >
          Approve selected ({selectedIds.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isDeciding || selectedIds.length === 0}
          onClick={() => onDecide("excluded", selectedIds)}
        >
          Exclude selected
        </Button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {plan.changes.map((change) => {
          const isExcluded = change.status === EImportChangeStatus.Excluded;
          return (
            <li
              key={change.id}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-2.5",
                "transition-[opacity,border-color] duration-150 ease-out",
                isExcluded && "opacity-55",
                change.status === EImportChangeStatus.NeedsReview
                  ? "border-amber-500/40"
                  : "border-border",
              )}
            >
              <Checkbox
                checked={checked.has(change.id)}
                onCheckedChange={() => toggle(change.id)}
                aria-label={`Select ${change.title}`}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm text-foreground", isExcluded && "line-through")}>
                  {change.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {TARGET_LABEL[change.target] ?? change.target} · {change.reason}
                  {change.parent_temp_key ? ` · under ${change.parent_temp_key.split(":")[1]}` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  change.status === EImportChangeStatus.Approved
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : change.status === EImportChangeStatus.NeedsReview
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {STATUS_LABEL[change.status] ?? change.status}
              </span>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {plan.can_apply
            ? "This is the first step that changes the project."
            : approved === 0
              ? "Approve at least one change to continue."
              : "Resolve the conflicts above to continue."}
        </p>
        <Button type="button" disabled={!plan.can_apply || isApplying} onClick={onApply}>
          {isApplying ? "Creating…" : "Create execution plan"}
        </Button>
      </div>
    </div>
  );
}
