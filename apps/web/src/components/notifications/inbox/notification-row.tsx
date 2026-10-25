"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notificationKindMeta } from "@/lib/notifications/kind-meta";
import { relativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";
import type { INotification } from "@/types";

interface NotificationRowProps {
  item: INotification;
  selected: boolean;
  onSelect: (item: INotification) => void;
  onToggleRead: (item: INotification) => void;
}

/**
 * A selectable Inbox list row (email master-detail model, GIN-270). Clicking the
 * row selects it (opens the detail pane) and marks it read; the actual
 * destination is opened from the detail pane's "Open" action. The row button and
 * the overflow menu are SIBLINGS so a menu click never selects the row.
 */
export function NotificationRow({ item, selected, onSelect, onToggleRead }: NotificationRowProps) {
  const meta = notificationKindMeta(item.kind);

  return (
    <li className="group relative">
      <button
        type="button"
        aria-current={selected}
        onClick={() => onSelect(item)}
        className={cn(
          "flex w-full gap-3 border-l-2 px-3 py-2.5 text-left transition-colors duration-150",
          "outline-none focus-visible:bg-accent/60 hover:bg-muted/60",
          selected
            ? "border-l-primary bg-accent"
            : "border-l-transparent",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
            meta.tint,
          )}
        >
          <HugeiconsIcon icon={meta.icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {!item.read ? (
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                item.read ? "font-medium text-foreground/80" : "font-semibold text-foreground",
              )}
            >
              <span className="sr-only">{meta.label}: </span>
              {item.title}
            </span>
            <time
              dateTime={item.created_at}
              className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
            >
              {relativeTime(item.created_at)}
            </time>
          </span>
          {item.body ? (
            <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
          ) : null}
          {item.actor || item.project ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {item.actor ? <span className="truncate">{item.actor.display_name}</span> : null}
              {item.actor && item.project ? <span aria-hidden>·</span> : null}
              {item.project ? (
                <span className="truncate font-medium text-foreground/70">{item.project.name}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Notification actions"
          className="absolute right-1.5 top-2 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onToggleRead(item)}>
            <HugeiconsIcon icon={Tick02Icon} className="size-4" />
            {item.read ? "Mark as unread" : "Mark as read"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
