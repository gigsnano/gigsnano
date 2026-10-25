"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  Edit02Icon,
  FileEditIcon,
  UserAdd01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { useProjectActivity } from "@/hooks/project/use-project-activity";
import { EmptyState } from "@/components/empty-state";
import { EProjectActivityType } from "@/types";
import { Avatar } from "@/components/ui/avatar";

const TYPE_ICON: Record<EProjectActivityType, IconSvgElement> = {
  [EProjectActivityType.Created]: PlusSignIcon,
  [EProjectActivityType.Updated]: Edit02Icon,
  [EProjectActivityType.Description]: FileEditIcon,
  [EProjectActivityType.Member]: UserAdd01Icon,
  [EProjectActivityType.Cycle]: Calendar03Icon,
  [EProjectActivityType.Story]: CheckmarkCircle02Icon,
  [EProjectActivityType.Comment]: Message01Icon,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Right-rail "Activity" tab — the project's activity feed, newest first. */
export function ProjectActivityTab({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: activity, isPending } = useProjectActivity(workspaceSlug, projectId);

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (!activity?.length) {
    return (
      <EmptyState
        assetKey="notifications"
        align="center"
        title="No activity yet"
        description="Changes to this project will show up here."
      />
    );
  }

  return (
    <ol className="flex flex-col">
      {activity.map((entry) => (
        <li key={entry.id} className="flex gap-3 py-2.5 text-sm">
          <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
            <HugeiconsIcon icon={TYPE_ICON[entry.type]} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <Avatar name={entry.actor_name} src={entry.actor_avatar_url} size="xs" />
              <span className="truncate text-foreground">
                <span className="font-medium">{entry.actor_name}</span>{" "}
                <span className="text-muted-foreground">{entry.action}</span>
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {timeAgo(entry.created_at)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
