"use client";

import { useState } from "react";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import {
  useLlmUsageByUser,
  useLlmUsageByWorkspace,
  useLlmUsageEvents,
  useLlmUsageHeatmapDaily,
  useLlmUsageHeatmapHourly,
  useLlmUsageMatrix,
  useLlmUsageSummary,
  useLlmUsageTimeseries,
} from "@/hooks/admin/use-admin";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { cn } from "@/lib/utils";
import type { ILlmUsageFilters } from "@/types";

import { LlmUsageActivityHeatmap } from "./llm-usage-activity-heatmap";
import { LlmUsageChart } from "./llm-usage-chart";
import { LlmUsageEventsTable } from "./llm-usage-events-table";
import { LlmUsageFilterChips } from "./llm-usage-filter-chips";
import { LlmUsageInsight } from "./llm-usage-insight";
import { LlmUsageMixPanel, type TLlmUsageMetric } from "./llm-usage-mix-panel";
import { llmUsageDefaultRange, LlmUsagePeriodTabs, type TLlmUsagePeriodPreset } from "./llm-usage-period-tabs";
import { LlmUsageSummaryCards } from "./llm-usage-summary-cards";
import { LlmUsageTopUsers } from "./llm-usage-top-users";
import { LlmUsageTopWorkspaces } from "./llm-usage-top-workspaces";

function LlmUsagePageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-14 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export function LlmUsagePage() {
  const [period, setPeriod] = useState<TLlmUsagePeriodPreset>("30d");
  const [range, setRange] = useState(llmUsageDefaultRange);
  const [metric, setMetric] = useState<TLlmUsageMetric>("tokens");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState<{ id: string; name: string } | null>(null);
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);
  const { setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(20);

  const baseFilters: ILlmUsageFilters = {
    from: range.from,
    to: range.to,
    selected_date: selectedDate ?? undefined,
    workspace_id: workspaceFilter?.id,
    user_id: userFilter?.id,
    source: sourceFilter,
    metric,
  };

  const summary = useLlmUsageSummary(baseFilters);
  const timeseries = useLlmUsageTimeseries(baseFilters);
  const daily = useLlmUsageHeatmapDaily(baseFilters);
  const hourly = useLlmUsageHeatmapHourly(baseFilters);
  const matrix = useLlmUsageMatrix({ ...baseFilters, limit: 10 });
  const byWorkspace = useLlmUsageByWorkspace({ ...baseFilters, limit: 10 });
  const byUser = useLlmUsageByUser({ ...baseFilters, limit: 10 });
  const events = useLlmUsageEvents({ ...baseFilters, ...pageFilters });

  const isPending =
    summary.isPending ||
    timeseries.isPending ||
    daily.isPending ||
    hourly.isPending ||
    matrix.isPending ||
    byWorkspace.isPending ||
    byUser.isPending ||
    events.isPending;
  const hasError =
    summary.error ||
    timeseries.error ||
    daily.error ||
    hourly.error ||
    matrix.error ||
    byWorkspace.error ||
    byUser.error ||
    events.error;

  const clearAll = () => {
    setSelectedDate(null);
    setWorkspaceFilter(null);
    setUserFilter(null);
    setSourceFilter(undefined);
    resetPagination();
  };

  return (
    <>
      <AdminHeader
        title="LLM Usage"
        actions={
          <div className="flex items-center gap-2">
            <LlmUsagePeriodTabs
              value={period}
              onChange={(nextPeriod, nextRange) => {
                setPeriod(nextPeriod);
                setRange(nextRange);
                resetPagination();
              }}
            />
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  metric === "tokens" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setMetric("tokens")}
              >
                Tokens
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  metric === "cost" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setMetric("cost")}
              >
                Cost
              </button>
            </div>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className={cn("t-skel", !isPending && "is-revealed")}>
          <div className={cn("t-skel-skeleton", isPending && "is-pulsing")}>
            <LlmUsagePageSkeleton />
          </div>
          <div className="t-skel-content space-y-4">
            {hasError ? (
              <EmptyState
                assetKey="generic"
                title="Couldn't load LLM usage"
                description="Try again in a moment."
                actions={[{ label: "Clear filters", onClick: clearAll, variant: "outline" }]}
              />
            ) : (
              <>
                <LlmUsageInsight summary={summary.data} />
                <LlmUsageSummaryCards summary={summary.data} timeseries={timeseries.data ?? []} />

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
                  <LlmUsageActivityHeatmap
                    daily={daily.data ?? []}
                    metric={metric}
                    selectedDate={selectedDate}
                    onSelectDate={(date) => {
                      setSelectedDate(date);
                      resetPagination();
                    }}
                  />
                  <LlmUsageMixPanel summary={summary.data} hourly={hourly.data ?? []} metric={metric} />
                </div>

                <LlmUsageChart points={timeseries.data ?? []} selectedDate={selectedDate} />

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <LlmUsageTopWorkspaces
                    rows={byWorkspace.data ?? []}
                    strips={matrix.data ?? []}
                    metric={metric}
                    activeWorkspaceId={workspaceFilter?.id}
                    onSelectWorkspace={(workspaceId) => {
                      if (!workspaceId) {
                        setWorkspaceFilter(null);
                        resetPagination();
                        return;
                      }
                      const row = (byWorkspace.data ?? []).find((item) => item.id === workspaceId);
                      setWorkspaceFilter({ id: workspaceId, name: row?.name ?? workspaceId });
                      resetPagination();
                    }}
                  />
                  <LlmUsageTopUsers
                    rows={byUser.data ?? []}
                    strips={matrix.data ?? []}
                    metric={metric}
                    activeUserId={userFilter?.id}
                    onSelectUser={(userId) => {
                      if (!userId) {
                        setUserFilter(null);
                        resetPagination();
                        return;
                      }
                      const row = (byUser.data ?? []).find((item) => item.id === userId);
                      setUserFilter({ id: userId, name: row?.name ?? userId });
                      resetPagination();
                    }}
                  />
                </div>

                <LlmUsageFilterChips
                  selectedDate={selectedDate}
                  workspace={workspaceFilter}
                  user={userFilter}
                  source={sourceFilter}
                  onClearDate={() => setSelectedDate(null)}
                  onClearWorkspace={() => setWorkspaceFilter(null)}
                  onClearUser={() => setUserFilter(null)}
                  onClearSource={() => setSourceFilter(undefined)}
                />

                <LlmUsageEventsTable
                  page={events.data}
                  onPageChange={setOffset}
                  onSelectWorkspace={(workspaceId, workspaceName) => {
                    setWorkspaceFilter({ id: workspaceId, name: workspaceName });
                    resetPagination();
                  }}
                  onSelectUser={(userId, userName) => {
                    setUserFilter({ id: userId, name: userName });
                    resetPagination();
                  }}
                  onSelectSource={(source) => {
                    setSourceFilter(source);
                    resetPagination();
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
