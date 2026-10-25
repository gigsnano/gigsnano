"use client";

import { useState } from "react";
import Link from "next/link";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useWorkspaceTimeEntries } from "@/hooks/workspace/use-time-report";
import {
  groupByPerson,
  groupByWorkItem,
  totalHours,
} from "@/lib/time/time-report-grouping";

type Tab = "person" | "work-item";

const TABS: { id: Tab; label: string }[] = [
  { id: "person", label: "By person" },
  { id: "work-item", label: "By work item" },
];

const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0+$/, "")}h`;

export function TimeReports({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useWorkspaceTimeEntries(workspaceSlug);
  const [tab, setTab] = useState<Tab>("person");

  return (
    <>
      <AppHeader />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load time report"
            description="Something went wrong fetching logged hours."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : !data?.length ? (
          <EmptyState
            assetKey="generic"
            title="No hours logged yet"
            description="Log hours on work items and they'll roll up into this report."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{fmtHours(totalHours(data))}</span>{" "}
                logged
              </span>
            </div>

            {tab === "person" ? (
              <PersonTable entries={data} />
            ) : (
              <WorkItemTable workspaceSlug={workspaceSlug} entries={data} />
            )}
          </div>
        )}
      </ContentWrapper>
    </>
  );
}

function PersonTable({ entries }: { entries: Parameters<typeof groupByPerson>[0] }) {
  const rows = groupByPerson(entries);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.user_id}
          className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <Avatar name={r.user_name} src={r.user_avatar_url} className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.user_name}</p>
            <p className="text-xs text-muted-foreground">
              {r.entry_count} {r.entry_count === 1 ? "entry" : "entries"}
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums">{fmtHours(r.total_hours)}</span>
        </li>
      ))}
    </ul>
  );
}

function WorkItemTable({
  workspaceSlug,
  entries,
}: {
  workspaceSlug: string;
  entries: Parameters<typeof groupByWorkItem>[0];
}) {
  const rows = groupByWorkItem(entries);
  const byStory = new Map(entries.map((e) => [e.story_id, e.project_id]));
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.story_id}>
          <Link
            href={`/${workspaceSlug}/projects/${byStory.get(r.story_id)}/issues/${r.story_id}`}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:border-primary/30 hover:bg-accent/40"
          >
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {r.story_code}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.story_title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.project_name} · {r.contributor_count}{" "}
                {r.contributor_count === 1 ? "contributor" : "contributors"}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums">{fmtHours(r.total_hours)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
