"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, RefreshIcon } from "@hugeicons/core-free-icons";

import {
  useForecast,
  useDeliveryMetrics,
  useProjectHealth,
} from "@/hooks/project/use-forecasting";
import { useProjectStories } from "@/hooks/story/use-stories";
import { HEALTH_STATUS_META, resolveHealthStatus } from "@/lib/forecasting/health-status";
import { ConfidenceBadge, StatusPill } from "@/components/forecasting/health-badges";
import { cn } from "@/lib/utils";
import type { IForecast, IHealth, IProject, IStory } from "@/types";

/** Drill-down (GIN-340): render contributing work-item ids as links to their
 *  detail view, preserving project context. Falls back to the id when the story
 *  isn't in the loaded set. */
function ContributingItems({
  ids,
  storyById,
  base,
}: {
  ids: string[];
  storyById: Map<string, IStory>;
  base: string;
}) {
  if (!ids.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const s = storyById.get(id);
        const label = s?.code ?? id.slice(0, 8);
        return (
          <Link
            key={id}
            href={`${base}/${id}`}
            className="rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent hover:underline"
            title={s?.title ?? "Open work item"}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtAge(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then) || !nowMs) return "";
  const mins = Math.max(0, Math.round((nowMs - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}


function ForecastTile({ pct, date }: { pct: number; date: string | null }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{pct}% chance by</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{fmtDate(date)}</div>
    </div>
  );
}

/** Proportional Today → Forecast timeline marking Today, Target and P50/P85/P95.
 *  Anchored to `nowMs` (captured once) so render stays pure for React Compiler. */
function Timeline({
  forecast,
  targetDate,
  nowMs,
}: {
  forecast: IForecast;
  targetDate: string | null;
  nowMs: number;
}) {
  const now = nowMs || Date.parse(forecast.generated_at);
  const points = [forecast.p50_date, forecast.p85_date, forecast.p95_date, targetDate]
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((t) => !Number.isNaN(t));
  const max = Math.max(now, ...points);
  const span = Math.max(1, max - now);
  const at = (iso: string | null) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.min(100, Math.max(0, ((t - now) / span) * 100));
  };

  const target = at(targetDate);
  const p50 = at(forecast.p50_date);
  const p85 = at(forecast.p85_date);
  const p95 = at(forecast.p95_date);

  return (
    <div className="mt-4">
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {p50 != null && p95 != null ? (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/25"
            style={{ left: `${p50}%`, width: `${Math.max(0, p95 - p50)}%` }}
          />
        ) : null}
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: "0%" }}
          title="Today"
        />
        {p85 != null ? (
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
            style={{ left: `${p85}%` }}
            title="85% forecast"
          />
        ) : null}
        {target != null ? (
          <span
            className="absolute top-0 h-8 w-px bg-amber-500"
            style={{ left: `${target}%` }}
            title="Target"
          />
        ) : null}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Today</span>
        {targetDate ? (
          <span className="text-amber-600 dark:text-amber-400">Target {fmtDate(targetDate)}</span>
        ) : null}
        <span>85% {fmtDate(forecast.p85_date)}</span>
      </div>
    </div>
  );
}

/** Evidence-backed recovery recommendations (GIN-339) — advisory, ordered, each
 *  with its projected impact and the decision it needs. */
function Recommendations({
  health,
  storyById,
  base,
}: {
  health: IHealth;
  storyById: Map<string, IStory>;
  base: string;
}) {
  if (!health.recommendations.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recommended actions</div>
      <ul className="space-y-2">
        {health.recommendations.map((rec) => (
          <li key={rec.action} className="rounded-lg border bg-card px-3 py-2">
            <div className="text-sm font-medium text-foreground">{rec.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{rec.impact}</div>
            <div className="mt-1 text-[11px] text-muted-foreground/80">
              Decision: {rec.decision_needed}
            </div>
            <ContributingItems ids={rec.contributing_ids} storyById={storyById} base={base} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Why-at-risk evidence — ordered reasons from the health engine, each drilling
 *  down to its contributing work items (GIN-340). */
function HealthReasons({
  health,
  storyById,
  base,
}: {
  health: IHealth;
  storyById: Map<string, IStory>;
  base: string;
}) {
  if (!health.reasons.length) return null;
  return (
    <ul className="space-y-2">
      {health.reasons.map((r) => (
        <li key={r.code} className="text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
            <span>
              {r.explanation}
              {r.contributing_ids.length ? (
                <span className="text-muted-foreground/70"> · {r.contributing_ids.length} item(s)</span>
              ) : null}
            </span>
          </div>
          <div className="pl-3">
            <ContributingItems ids={r.contributing_ids} storyById={storyById} base={base} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProjectHealth({
  workspaceSlug,
  projectId,
  project,
}: {
  workspaceSlug: string;
  projectId: string;
  project: IProject;
}) {
  const forecastQuery = useForecast(workspaceSlug, projectId);
  const metricsQuery = useDeliveryMetrics(workspaceSlug, projectId);
  const healthQuery = useProjectHealth(workspaceSlug, projectId);

  // Capture "now" once after mount so render stays pure (no Date.now() in render).
  // Reading the clock is a genuine post-mount browser read, not props-derivable —
  // the case the rule itself says to suppress.
  const [nowMs, setNowMs] = useState(0);
  // react-doctor-disable-next-line react-hooks-js/set-state-in-effect -- one-time clock read after mount
  useEffect(() => setNowMs(Date.now()), []);

  // Resolve contributing ids → work items for drill-down links (GIN-340).
  const { data: stories } = useProjectStories(workspaceSlug, projectId);
  const storyById = new Map((stories ?? []).map((s) => [s.id, s]));
  const base = `/${workspaceSlug}/projects/${projectId}/issues`;

  const forecast = forecastQuery.data;
  const health = healthQuery.data;
  const scope = metricsQuery.data?.scope;
  const isPending = forecastQuery.isPending || metricsQuery.isPending || healthQuery.isPending;
  const isError = forecastQuery.isError || metricsQuery.isError || healthQuery.isError;

  const status = resolveHealthStatus(health);
  const confidence = health?.confidence ?? forecast?.confidence ?? "no_data";

  return (
    <section className="mt-12 border-t pt-6" aria-labelledby="project-health-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="project-health-heading" className="text-sm font-semibold text-foreground">
          Health &amp; forecast
        </h2>
        {health && !isPending && !isError ? (
          <span className="text-xs text-muted-foreground">Updated {fmtAge(health.generated_at, nowMs)}</span>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3">
          <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      ) : isError ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Alert01Icon} className="size-4 text-destructive" />
            Couldn&apos;t load project health.
          </span>
          <button
            type="button"
            onClick={() => {
              void forecastQuery.refetch();
              void metricsQuery.refetch();
              void healthQuery.refetch();
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
            Retry
          </button>
        </div>
      ) : !forecast?.forecastable ? (
        // Not enough history to forecast — explain what's needed, never a fake date.
        <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-4">
          <StatusPill status={status} />
          <p className="mt-2 text-sm text-muted-foreground">
            {health?.reasons[0]?.explanation ?? HEALTH_STATUS_META[status].meaning}{" "}
            {scope ? (
              <>
                {scope.delivered} of {scope.total} work items delivered
                {scope.remaining ? ` · ${scope.remaining} remaining` : ""}.
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            <ConfidenceBadge confidence={confidence} />
            {scope ? (
              <span
                className="text-sm text-muted-foreground"
                title="Counts leaf work items only — a parent isn't double-counted with its children, so this can differ from the Progress total."
              >
                <span className="font-medium tabular-nums text-foreground">
                  {scope.delivered}/{scope.total}
                </span>{" "}
                work items delivered · {forecast.remaining_units} remaining
              </span>
            ) : null}
          </div>

          <p className="sr-only">
            {HEALTH_STATUS_META[status].label}: {HEALTH_STATUS_META[status].meaning} Forecast completion:
            50% by {fmtDate(forecast.p50_date)}, 85% by {fmtDate(forecast.p85_date)}, 95% by{" "}
            {fmtDate(forecast.p95_date)}.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <ForecastTile pct={50} date={forecast.p50_date} />
            <ForecastTile pct={85} date={forecast.p85_date} />
            <ForecastTile pct={95} date={forecast.p95_date} />
          </div>

          <Timeline forecast={forecast} targetDate={project.target_date ?? null} nowMs={nowMs} />

          {health ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Why</div>
              <HealthReasons health={health} storyById={storyById} base={base} />
            </div>
          ) : null}

          {health ? (
            <Recommendations health={health} storyById={storyById} base={base} />
          ) : null}
        </div>
      )}
    </section>
  );
}
