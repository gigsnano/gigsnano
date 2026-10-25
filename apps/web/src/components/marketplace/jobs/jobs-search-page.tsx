"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";

import { EmptyState } from "@/components/empty-state";
import {
  EMPTY_JOB_FILTERS,
  filterJobs,
  sortJobs,
  type EJobSort,
  type IJobFilters,
} from "@/lib/marketplace/marketplace-filtering";
import { useMarketplaceJobs } from "@/hooks/marketplace/use-marketplace";

import { JobCard } from "./job-card";
import { JobFiltersRail } from "./job-filters-rail";
import { ListSkeleton } from "../shared/list-skeleton";
import { SearchInput } from "../shared/search-input";

/** Job search: left filter rail + query/sort toolbar + result list. */
export function JobsSearchPage({ q }: { q: string }) {
  const router = useRouter();
  const { data: jobs, isPending, isError, refetch } = useMarketplaceJobs();
  const [search, setSearch] = useAdjustedState(q);
  const [filters, setFilters] = useState<IJobFilters>(EMPTY_JOB_FILTERS);
  const [sort, setSort] = useState<EJobSort>("best_match");

  const updateSearch = (value: string) => {
    setSearch(value);
    router.replace(
      `/marketplace/jobs${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`,
      { scroll: false },
    );
  };

  const results = jobs ? sortJobs(filterJobs(jobs, search, filters), sort) : [];
  const anyActive =
    filters.experience.length > 0 || filters.jobType.length > 0 || filters.clientHistory.length > 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
      <JobFiltersRail jobs={jobs ?? []} filters={filters} onChange={setFilters} />

      <div className="min-w-0">
        <SearchInput
          value={search}
          onChange={updateSearch}
          placeholder="Search for jobs"
          className="max-w-xl"
        />

        {isPending ? (
          <div className="mt-4">
            <ListSkeleton rows={5} />
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load jobs"
            description="Something went wrong while loading the job feed."
            actions={[{ label: "Try again", onClick: () => refetch() }]}
          />
        ) : results.length === 0 ? (
          <EmptyState
            assetKey="search-empty"
            title="No jobs match your search"
            description="Try different keywords or remove some filters."
            actions={[
              {
                label: "Clear search & filters",
                onClick: () => {
                  updateSearch("");
                  setFilters(EMPTY_JOB_FILTERS);
                },
              },
            ]}
          />
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {results.length} {results.length === 1 ? "job" : "jobs"} found
                {anyActive || search.trim() ? " for your search" : ""}
              </p>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Sort:
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as EJobSort)}
                  className="h-8 cursor-pointer rounded-md border bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="best_match">Best match</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            </div>

            <div className="mt-2 flex flex-col divide-y">
              {results.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
