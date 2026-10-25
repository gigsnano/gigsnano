"use client";

import Link from "next/link";

import { StatusPill } from "@/components/forecasting/health-badges";
import { useForecast, useProjectHealth } from "@/hooks/project/use-forecasting";
import { useProjects } from "@/hooks/project/use-projects";
import { useDashboardFilter } from "@/hooks/workspace/use-dashboard-filter";
import { CONFIDENCE_META, resolveHealthStatus } from "@/lib/forecasting/health-status";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** One project's condensed forecast/health line. Reuses the same forecasting
 *  hooks + status derivation as the Project Health card (GIN-341) — no separate
 *  calculation. A single project failing shows "unavailable" rather than blanking
 *  the whole widget. */
function ProjectHealthRow({
  workspaceSlug,
  projectId,
  name,
}: {
  workspaceSlug: string;
  projectId: string;
  name: string;
}) {
  const health = useProjectHealth(workspaceSlug, projectId);
  const forecast = useForecast(workspaceSlug, projectId);

  const status = resolveHealthStatus(health.data);
  const p85 = forecast.data?.p85_date ?? null;
  const confidence = health.data?.confidence ?? forecast.data?.confidence ?? "no_data";
  const confidenceLabel = (CONFIDENCE_META[confidence] ?? CONFIDENCE_META.no_data).label;

  const loading = health.isPending || forecast.isPending;
  const failed = health.isError && forecast.isError;

  const p85Label = fmtDate(p85);
  const subline = failed
    ? "Health unavailable"
    : loading
      ? "…"
      : p85Label
        ? `85% by ${p85Label} · ${confidenceLabel}`
        : confidenceLabel;

  return (
    <li>
      <Link
        href={`/${workspaceSlug}/projects/${projectId}`}
        className="flex items-center justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/50"
      >
        <div className="min-w-0">
          <span className="block truncate text-xs font-medium">{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{subline}</span>
        </div>
        {!loading && !failed ? <StatusPill status={status} className="shrink-0" /> : null}
      </Link>
    </li>
  );
}

/**
 * GIN-341 — Manager-360 project-health roll-up. One forecast/health line per
 * project, reusing the shared forecasting hooks and `resolveHealthStatus` so the
 * Manager view can never disagree with a project's own Health card. Projects are
 * already RBAC-scoped by `useProjects`, so sensitive projects never appear.
 *
 * ponytail: one health + one forecast fetch per project — fine for typical
 * workspace sizes; add a workspace-aggregate endpoint if project counts grow large.
 */
export function ProjectHealthSummaryBody({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: allProjects, isPending, isError } = useProjects(workspaceSlug, true);
  const selected = useDashboardFilter()?.project_ids;
  const selectedSet = new Set(selected);
  const projects = selected?.length
    ? allProjects?.filter((p) => selectedSet.has(p.id))
    : allProjects;

  if (isPending) return <WidgetSkeleton rows={4} />;
  if (isError || !projects) return <WidgetMessage>Couldn&apos;t load projects.</WidgetMessage>;
  if (projects.length === 0) {
    return (
      <WidgetMessage>
        {selected?.length ? "None of the filtered projects are visible here." : "No projects yet."}
      </WidgetMessage>
    );
  }

  return (
    <ul className="gn-stagger flex flex-col gap-1 p-2">
      {projects.map((p) => (
        <ProjectHealthRow
          key={p.id}
          workspaceSlug={workspaceSlug}
          projectId={p.id}
          name={p.name}
        />
      ))}
    </ul>
  );
}
