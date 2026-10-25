"use client";

import { Button } from "@/components/ui/button";
import {
  clientHistoryBucket,
  type EClientHistoryBucket,
  type IJobFilters,
} from "@/lib/marketplace/marketplace-filtering";
import type { IMarketplaceJob } from "@/types";
import { EExperienceLevel, EJobType } from "@/types";

import { EXPERIENCE_LABELS } from "../shared/job-meta";
import { FilterOption, FilterSection } from "../shared/filter-section";

const JOB_TYPE_LABELS: Record<EJobType, string> = {
  [EJobType.Hourly]: "Hourly",
  [EJobType.Fixed]: "Fixed-price",
};

const CLIENT_HISTORY_LABELS: Record<EClientHistoryBucket, string> = {
  none: "No hires",
  "1-9": "1 to 9 hires",
  "10+": "10+ hires",
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Left filter rail on the job search page (Experience · Job type · Client history). */
export function JobFiltersRail({
  jobs,
  filters,
  onChange,
}: {
  /** Unfiltered result set — used for the per-option counts. */
  jobs: IMarketplaceJob[];
  filters: IJobFilters;
  onChange: (filters: IJobFilters) => void;
}) {
  const countBy = (predicate: (job: IMarketplaceJob) => boolean) => jobs.filter(predicate).length;
  const anyActive =
    filters.experience.length > 0 || filters.jobType.length > 0 || filters.clientHistory.length > 0;

  return (
    <aside className="sticky top-20 hidden self-start lg:block" aria-label="Job filters">
      <div className="mb-2 flex h-8 items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {anyActive && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onChange({ experience: [], jobType: [], clientHistory: [] })}
          >
            Clear all
          </Button>
        )}
      </div>

      <FilterSection title="Experience level">
        {Object.values(EExperienceLevel).map((level) => (
          <FilterOption
            key={level}
            label={EXPERIENCE_LABELS[level]}
            count={countBy((j) => j.experience_level === level)}
            checked={filters.experience.includes(level)}
            onChange={() => onChange({ ...filters, experience: toggle(filters.experience, level) })}
          />
        ))}
      </FilterSection>

      <FilterSection title="Job type">
        {Object.values(EJobType).map((type) => (
          <FilterOption
            key={type}
            label={JOB_TYPE_LABELS[type]}
            count={countBy((j) => j.job_type === type)}
            checked={filters.jobType.includes(type)}
            onChange={() => onChange({ ...filters, jobType: toggle(filters.jobType, type) })}
          />
        ))}
      </FilterSection>

      <FilterSection title="Client history">
        {(Object.keys(CLIENT_HISTORY_LABELS) as EClientHistoryBucket[]).map((bucket) => (
          <FilterOption
            key={bucket}
            label={CLIENT_HISTORY_LABELS[bucket]}
            count={countBy((j) => clientHistoryBucket(j.client.hires) === bucket)}
            checked={filters.clientHistory.includes(bucket)}
            onChange={() =>
              onChange({ ...filters, clientHistory: toggle(filters.clientHistory, bucket) })
            }
          />
        ))}
      </FilterSection>
    </aside>
  );
}
