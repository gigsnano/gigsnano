"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  useNotifications,
  useUnreadNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/workspace/use-notifications";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { PendingInviteBanner } from "@/components/workspace/pending-invite-banner";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { groupByDate } from "@/lib/notifications/grouping";
import { INBOX_TABS, isNotificationCategory } from "@/lib/notifications/inbox-filters";
import { cn } from "@/lib/utils";
import type { ENotificationCategory, INotification } from "@/types";

import { InboxFilters } from "./inbox-filters";
import { InboxSkeleton } from "./inbox-skeleton";
import { NotificationRow } from "./notification-row";
import { NotificationDetail } from "./notification-detail";

const PAGE_LIMIT = 20;

export function Inbox({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterParam = searchParams.get("filter");
  const category: ENotificationCategory = isNotificationCategory(filterParam) ? filterParam : "all";

  const { offset, setOffset, reset } = useOffsetPagination(PAGE_LIMIT);
  const { data: page, isPending, isError, refetch } = useNotifications(workspaceSlug, {
    category,
    limit: PAGE_LIMIT,
    offset,
  });
  const { data: unread } = useUnreadNotifications(workspaceSlug);
  const markRead = useMarkNotificationRead(workspaceSlug);
  const markAll = useMarkAllNotificationsRead(workspaceSlug);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unreadCount = unread?.total_unread ?? 0;
  const items = page?.items ?? [];
  const groups = groupByDate(items);
  const total = page?.total ?? 0;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  function setCategory(next: ENotificationCategory) {
    reset();
    setSelectedId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("filter");
    else params.set("filter", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function selectNotification(item: INotification) {
    setSelectedId(item.id);
    if (!item.read) {
      markRead.mutate(
        { id: item.id, read: true },
        { onError: () => setActionError("Couldn't update this notification. Please try again.") },
      );
    }
  }

  function toggleRead(item: INotification) {
    setActionError(null);
    markRead.mutate(
      { id: item.id, read: !item.read },
      { onError: () => setActionError("Couldn't update this notification. Please try again.") },
    );
  }

  function markAllRead() {
    setActionError(null);
    markAll.mutate(undefined, {
      onError: () => setActionError("Couldn't mark all as read. Please try again."),
    });
  }

  return (
    <>
      <AppHeader
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 ? (
              <span
                className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums"
                aria-label={`${unreadCount} unread`}
              >
                {unreadCount}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={unreadCount === 0 || markAll.isPending}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          </div>
        }
      />
      <ContentWrapper className="overflow-hidden p-0">
        <TooltipProvider delayDuration={200}>
          <div className="relative flex h-full">
            {/* List pane */}
            <section
              aria-label="Inbox"
              className="flex h-full w-full min-w-0 flex-col lg:w-[380px] lg:shrink-0 lg:border-r"
            >
              <h1 className="sr-only">Inbox</h1>

              <div className="shrink-0 border-b">
                <InboxFilters value={category} onChange={setCategory} />
              </div>

              {actionError ? (
                <p role="status" className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
                  {actionError}
                </p>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="p-2">
                  <PendingInviteBanner />
                </div>
                {isPending ? (
                  <InboxSkeleton />
                ) : isError ? (
                  <EmptyState
                    assetKey="error"
                    title="Couldn't load your inbox"
                    description="Something went wrong. Please try again."
                    actions={[{ label: "Retry", onClick: () => refetch() }]}
                  />
                ) : items.length === 0 ? (
                  category === "all" ? (
                    <EmptyState
                      assetKey="notifications"
                      title="You're all caught up"
                      description="Mentions, assignments, and sprint updates will appear here."
                    />
                  ) : (
                    <EmptyState
                      assetKey="notifications"
                      title="Nothing here"
                      description={`No ${INBOX_TABS.find((t) => t.id === category)?.label.toLowerCase()} notifications.`}
                      actions={[{ label: "Clear filters", onClick: () => setCategory("all") }]}
                    />
                  )
                ) : (
                  <>
                    {groups.map((group) => (
                      <div key={group.key} className="pb-1">
                        <h2 className="sticky top-0 z-[1] bg-background/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                          {group.label}
                        </h2>
                        <ul>
                          {group.items.map((item) => (
                            <NotificationRow
                              key={item.id}
                              item={item}
                              selected={item.id === selectedId}
                              onSelect={selectNotification}
                              onToggleRead={toggleRead}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                    {total > PAGE_LIMIT ? (
                      <div className="p-3">
                        <OffsetPagination
                          offset={offset}
                          limit={PAGE_LIMIT}
                          total={total}
                          onOffsetChange={setOffset}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>

            {/* Detail pane — desktop */}
            <div className="hidden min-w-0 flex-1 lg:flex">
              <NotificationDetail item={selected} onOpen={selectNotification} onToggleRead={toggleRead} />
            </div>

            {/* Detail pane — mobile slide-over */}
            <div
              data-open={selected != null}
              className={cn(
                "t-detail-slide absolute inset-0 z-20 bg-background lg:hidden",
                selected == null && "pointer-events-none",
              )}
              aria-hidden={selected == null}
            >
              <NotificationDetail
                item={selected}
                onOpen={selectNotification}
                onToggleRead={toggleRead}
                onBack={() => setSelectedId(null)}
              />
            </div>
          </div>
        </TooltipProvider>
      </ContentWrapper>
    </>
  );
}
