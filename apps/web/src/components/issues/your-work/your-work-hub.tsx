"use client";

import { useState } from "react";

import { useMyStories } from "@/hooks/story/use-stories";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { buildFocus } from "@/lib/your-work/attention";
import { cn } from "@/lib/utils";

import { WorkspaceWorkItemsList } from "../workspace-work-items-list";
import { FocusView } from "./focus-view";

type Tab = "focus" | "all";

const TABS: { id: Tab; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "all", label: "All items" },
];

/**
 * Workspace "Your Work" hub (GIN-419). Focus is the default: a cross-project
 * attention queue built from the member's open assigned items. "All items"
 * preserves the flat product-story table as a secondary system view.
 */
export function YourWorkHub({ workspaceSlug }: { workspaceSlug: string }) {
  const [tab, setTab] = useState<Tab>("focus");
  const { data: me } = useAuthUser();
  const { data: page, isPending, isError, refetch } = useMyStories(workspaceSlug, {
    open_only: true,
  });

  // `useMyStories` returns an offset page, not a bare array — this branch was
  // written before that change landed and passed the envelope straight through.
  const focus = page ? buildFocus(page.items, new Date()) : undefined;
  const s = focus?.summary;
  const parts = [
    s?.needAttention ? `${s.needAttention} need attention` : null,
    s?.overdue ? `${s.overdue} overdue` : null,
    s?.dueToday ? `${s.dueToday} due today` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div role="tablist" aria-label="Your work view" className="inline-flex rounded-lg bg-muted p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "focus" && parts.length > 0 ? (
          <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>
        ) : null}
      </div>

      {tab === "focus" ? (
        <div className="px-6 pb-6">
          <FocusView
            workspaceSlug={workspaceSlug}
            result={focus}
            isPending={isPending}
            isError={isError}
            refetch={refetch}
            currentUserId={me?.id}
          />
        </div>
      ) : (
        <WorkspaceWorkItemsList workspaceSlug={workspaceSlug} />
      )}
    </div>
  );
}
