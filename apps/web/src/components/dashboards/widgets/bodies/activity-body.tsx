"use client";

import Link from "next/link";

import { useNotifications } from "@/hooks/workspace/use-notifications";
import { ENotificationKind } from "@/types";
import { cn } from "@/lib/utils";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

/**
 * GIN-51 — Recent activity widget. Renders the workspace event stream
 * (assignments, mentions, sprint + system events) newest-first. Backed by the
 * live notifications feed until a richer activity API (GIN-54) lands.
 */
const KIND_DOT: Record<ENotificationKind, string> = {
  [ENotificationKind.Assignment]: "bg-blue-500",
  [ENotificationKind.Mention]: "bg-violet-500",
  [ENotificationKind.Sprint]: "bg-emerald-500",
  [ENotificationKind.System]: "bg-muted-foreground/50",
  [ENotificationKind.Review]: "bg-primary",
  [ENotificationKind.Agent]: "bg-primary/70",
};

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function ActivityBody({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError } = useNotifications(workspaceSlug, { limit: 20 });

  if (isPending) return <WidgetSkeleton />;
  if (isError) return <WidgetMessage>Couldn&apos;t load activity.</WidgetMessage>;
  if (!data?.items.length) return <WidgetMessage>No recent activity.</WidgetMessage>;

  return (
    <ul className="divide-y">
      {data.items.map((n) => {
        const row = (
          <div className="flex items-start gap-2.5 px-3 py-2">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", KIND_DOT[n.kind])} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{n.title}</p>
              {n.body ? (
                <p className="truncate text-xs text-muted-foreground">{n.body}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {timeAgo(n.created_at)}
            </span>
          </div>
        );
        return (
          <li key={n.id}>
            {n.href ? (
              <Link href={n.href} className="block hover:bg-muted/50">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
