"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { EWidgetDateRange, type IDashboardFilters } from "@/types";

import { DateFilter } from "./date-filter";
import { ProjectFilter } from "./project-filter";
import "./dashboard-filters.css";

/**
 * The dashboard-wide filter: which projects, and optionally which dates. Every
 * widget on the board reads it (see `DashboardFilterProvider`); it's saved with
 * the dashboard, so it's there on the next visit and on any device.
 */
export function DashboardFilterBar({
  workspaceSlug,
  filters,
  onChange,
}: {
  workspaceSlug: string;
  filters: IDashboardFilters;
  onChange: (next: IDashboardFilters) => void;
}) {
  const projectIds = filters.project_ids ?? [];
  const active =
    projectIds.length > 0 ||
    (filters.date_range !== undefined && filters.date_range !== EWidgetDateRange.All);

  return (
    <search aria-label="Dashboard filters" className="mb-4 flex flex-wrap items-center gap-2">
      <ProjectFilter
        workspaceSlug={workspaceSlug}
        value={projectIds}
        onChange={(ids) => onChange({ ...filters, project_ids: ids.length ? ids : undefined })}
      />
      <DateFilter
        value={filters}
        onChange={(dates) => onChange({ project_ids: filters.project_ids, ...dates })}
      />
      {active ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange({})}
          className="t-filter-clear gap-1.5 text-muted-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          Clear filters
        </Button>
      ) : null}
    </search>
  );
}
