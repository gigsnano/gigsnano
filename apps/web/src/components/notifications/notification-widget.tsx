"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification01Icon } from "@hugeicons/core-free-icons";

import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/workspace/use-notifications";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notificationKindMeta } from "@/lib/notifications/kind-meta";
import { cn } from "@/lib/utils";
import { type INotification } from "@/types";

/**
 * In-app notification widget (GIN-104). The top-bar bell opens a popover with
 * the most recent items — digest deliveries (GIN-103) surface here as in-app
 * notifications, so this "syncs" with the email digest. Clicking a row marks it
 * read and follows its link; "View all" goes to the full inbox.
 */
export function NotificationWidget({
  workspaceSlug,
  unreadCount,
}: {
  workspaceSlug: string;
  unreadCount: number;
}) {
  const { data: page } = useNotifications(workspaceSlug, { limit: 8 });
  const markRead = useMarkNotificationRead(workspaceSlug);
  const markAll = useMarkAllNotificationsRead(workspaceSlug);

  const items = page?.items ?? [];

  return (
    <Popover>
      <PopoverTrigger
        aria-label={unreadCount > 0 ? `Inbox, ${unreadCount} unread` : "Inbox"}
        className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:scale-[0.97]"
      >
        <HugeiconsIcon icon={Notification01Icon} className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 text-foreground">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            items.map((n) => (
              <NotificationItem
                key={n.id}
                item={n}
                onOpen={() => {
                  if (!n.read) markRead.mutate({ id: n.id, read: true });
                }}
              />
            ))
          )}
        </div>

        <div className="border-t px-3 py-2 text-center">
          <Link
            href={`/${workspaceSlug}/notifications`}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  item,
  onOpen,
}: {
  item: INotification;
  onOpen: () => void;
}) {
  const Icon = notificationKindMeta(item.kind).icon;
  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
          item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <HugeiconsIcon icon={Icon} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.body}</span>
        <time className="mt-1 block text-[11px] text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </time>
      </span>
      {!item.read ? <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /> : null}
    </>
  );

  const rowClass = cn(
    "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50",
    !item.read && "bg-primary/5",
  );

  return item.href ? (
    <Link href={item.href} onClick={onOpen} className={rowClass}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={rowClass}>
      {body}
    </button>
  );
}
