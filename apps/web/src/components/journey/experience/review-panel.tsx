import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Message01Icon, UserIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Right "Review" column — approver, comments, unresolved decisions, Approve. */
export function ReviewPanel({
  version,
  approver,
  approved,
  openDecisions,
  onApprove,
}: {
  version: number;
  approver: string;
  approved: boolean;
  openDecisions: string[];
  onApprove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Review</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Draft {version}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <HugeiconsIcon icon={Message01Icon} className="size-4" />
        4 comments · 2 unresolved
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <HugeiconsIcon icon={UserIcon} className="size-3.5" />
        </span>
        <span className="text-muted-foreground">Approver</span>
        <span className="ml-auto font-medium text-foreground">{approver}</span>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Open decisions</p>
        {openDecisions.length === 0 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">All decisions resolved.</p>
        ) : (
          <ul className="space-y-1">
            {openDecisions.map((d) => (
              <li key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onApprove}
        disabled={approved}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] disabled:cursor-default",
          approved ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {approved ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" /> : null}
        {approved ? "Experience approved" : "Approve experience"}
      </button>
      {approved ? (
        <p className="text-center text-[11px] text-muted-foreground">
          Experience Contract v{version} created — architecture & planning can consume it.
        </p>
      ) : null}
    </div>
  );
}
