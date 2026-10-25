import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, ArrowDownRight01Icon, CancelCircleIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { ECycleStateGroup, type ICycleProgress } from "@/types";

const ON_CHART: { key: string; label: string; dot: string; dashed?: boolean; value: (p: ICycleProgress) => number }[] = [
  { key: "ideal", label: "Today's ideal Pending", dot: "bg-muted-foreground", dashed: true, value: (p) => p.counts.unstarted + p.counts.started + p.leading_by },
  { key: "pending", label: "Pending", dot: "bg-emerald-500", value: (p) => p.counts.unstarted + p.counts.started },
  { key: "started", label: "Started", dot: "bg-amber-500", value: (p) => p.counts.started },
  { key: "scope", label: "Scope", dot: "bg-sky-500", value: (p) => p.scope },
];

const OTHER: { group: ECycleStateGroup; label: string }[] = [
  { group: ECycleStateGroup.Completed, label: "Done" },
  { group: ECycleStateGroup.Unstarted, label: "Unstarted" },
  { group: ECycleStateGroup.Backlog, label: "Backlog" },
];

export function CycleBreakdownPanel({ progress }: { progress: ICycleProgress }) {
  const leading = progress.leading_by;
  return (
    <div className="flex w-full shrink-0 flex-col gap-4 md:w-[340px]">
      <div>
        <p className="text-xs text-muted-foreground">Breakdown of this cycle&apos;s work items</p>
        <p
          className={cn(
            "mt-1 flex items-center gap-1.5 text-sm font-semibold",
            leading >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
          )}
        >
          <HugeiconsIcon icon={leading >= 0 ? ArrowUpRight01Icon : ArrowDownRight01Icon} className="size-4" />
          {leading === 0
            ? "On track"
            : leading > 0
              ? `Leading by ${leading} work items`
              : `Behind by ${Math.abs(leading)} work items`}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Work Items by stategroups on chart</p>
        <ul className="flex flex-col gap-2">
          {ON_CHART.map((row) => (
            <li key={row.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className={cn("h-0.5 w-4 rounded-full", row.dot, row.dashed && "opacity-60 [border-top:2px_dotted] bg-transparent")}
                />
                <span className="text-foreground">{row.label}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{row.value(progress)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Other stategroups</p>
        <ul className="flex flex-col gap-2">
          {OTHER.map((row) => (
            <li key={row.group} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">{progress.counts[row.group]}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        <HugeiconsIcon icon={CancelCircleIcon} className="size-3.5" />
        Excluded {progress.counts.cancelled} cancelled work items
      </p>
    </div>
  );
}
