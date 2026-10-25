"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";

import { AvatarGroup } from "@/components/ui/avatar-group";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { cn } from "@/lib/utils";
import type { ICycle, ICycleProgress, IMemberPreview } from "@/types";

import { CycleActionsMenu } from "./cycle-actions-menu";

function formatRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
  const s = new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  if (!end) return s;
  const e = new Date(`${end}T00:00:00Z`).toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
    timeZone: "UTC",
  });
  return `${s} – ${e}`;
}

export function CycleRowMeta({
  cycle,
  progress,
  workspaceSlug,
  projectId,
}: {
  cycle: ICycle;
  progress?: ICycleProgress;
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: members } = useProjectMembers(workspaceSlug, projectId);

  const range = formatRange(cycle.start_date, cycle.end_date);

  const assigneePreviews: IMemberPreview[] = (progress?.assignees ?? [])
    .map((a) => {
      const m = members?.find((pm) => pm.user_id === a.user_id);
      return m
        ? { id: m.user_id, display_name: m.display_name, avatar_url: m.avatar_url }
        : null;
    })
    .filter((x): x is IMemberPreview => x !== null);

  return (
    <div className="flex items-center gap-3">
      {progress ? (
        <div className="flex items-center gap-1.5">
          <ProgressRing value={progress.completion_pct} size={22} strokeWidth={2.5} />
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {progress.completion_pct}% ({progress.counts.completed}/{progress.scope})
          </span>
        </div>
      ) : null}

      {progress && progress.scope > 0 ? (
        <span
          className={cn(
            "text-xs font-medium",
            progress.leading_by > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : progress.leading_by < 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {progress.leading_by > 0
            ? `Leading ${progress.leading_by}`
            : progress.leading_by < 0
              ? `Behind ${Math.abs(progress.leading_by)}`
              : "On track"}
        </span>
      ) : null}

      {range ? (
        <span className="hidden items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">
          <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />
          {range}
        </span>
      ) : null}

      {assigneePreviews.length > 0 ? <AvatarGroup members={assigneePreviews} /> : null}

      <CycleActionsMenu cycle={cycle} workspaceSlug={workspaceSlug} projectId={projectId} />
    </div>
  );
}
