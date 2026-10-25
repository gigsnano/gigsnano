"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Alert02Icon,
  Mail01Icon,
  MailOpen01Icon,
  InboxIcon,
} from "@hugeicons/core-free-icons";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notificationKindMeta } from "@/lib/notifications/kind-meta";
import { relativeTime } from "@/lib/format/relative-time";
import { formatTimestamp } from "@/lib/format/timestamp";
import { cn } from "@/lib/utils";
import type { INotification } from "@/types";

/** Right-pane reading view for the selected notification (email master-detail). */
export function NotificationDetail({
  item,
  onOpen,
  onToggleRead,
  onBack,
}: {
  item: INotification | null;
  onOpen: (item: INotification) => void;
  onToggleRead: (item: INotification) => void;
  onBack?: () => void;
}) {
  if (!item) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <HugeiconsIcon icon={InboxIcon} className="size-6" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">
          Select a notification to read
        </p>
      </div>
    );
  }

  const meta = notificationKindMeta(item.kind);
  const navigable = Boolean(item.href);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-4">
        <div className="flex items-center gap-1">
          {onBack ? (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to inbox">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>
          ) : null}
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              meta.tint,
            )}
          >
            <HugeiconsIcon icon={meta.icon} className="size-4" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{meta.label}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggleRead(item)}
              aria-label={item.read ? "Mark as unread" : "Mark as read"}
            >
              <HugeiconsIcon icon={item.read ? MailOpen01Icon : Mail01Icon} className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{item.read ? "Mark as unread" : "Mark as read"}</TooltipContent>
        </Tooltip>
      </div>

      {/* Body (re-keyed per selection so it re-enters with the swap transition) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div key={item.id} className="t-detail-swap flex w-full flex-col p-5 sm:p-8">
          {/* Email-style header: subject + actor on the left, timestamp pinned right */}
          <div className="flex w-full items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {item.actor ? (
                <Avatar name={item.actor.display_name} src={item.actor.avatar_url} size="md" />
              ) : (
                <span className={cn("flex size-10 items-center justify-center rounded-full", meta.tint)}>
                  <HugeiconsIcon icon={meta.icon} className="size-5" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-snug text-balance">{item.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {item.actor ? (
                    <span className="font-medium text-foreground">{item.actor.display_name}</span>
                  ) : null}
                  {item.actor && item.project ? <span aria-hidden>·</span> : null}
                  {item.project ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground/70">
                      {item.project.name}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <time
                  dateTime={item.created_at}
                  className="shrink-0 whitespace-nowrap text-sm text-muted-foreground"
                >
                  {relativeTime(item.created_at)}
                </time>
              </TooltipTrigger>
              <TooltipContent>{formatTimestamp(item.created_at)}</TooltipContent>
            </Tooltip>
          </div>

          <hr className="my-5 border-border" />

          {item.body ? (
            <p className="w-full whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {item.body}
            </p>
          ) : null}

          <div className="mt-6">
            {navigable ? (
              <Button asChild size="sm" onClick={() => onOpen(item)}>
                <Link href={item.href as string}>
                  Open
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                </Link>
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                <HugeiconsIcon icon={Alert02Icon} className="size-4" />
                Destination no longer available
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
