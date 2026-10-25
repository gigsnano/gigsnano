"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";

import { EmptyState } from "@/components/empty-state";
import {
  EMPTY_TALENT_FILTERS,
  filterFreelancers,
  type ITalentFilters,
} from "@/lib/marketplace/marketplace-filtering";
import { useFreelancers } from "@/hooks/marketplace/use-marketplace";

import { FreelancerCard } from "./freelancer-card";
import { TalentFiltersRail } from "./talent-filters-rail";
import { ListSkeleton } from "../shared/list-skeleton";
import { SearchInput } from "../shared/search-input";

/** Talent search: filter rail + query toolbar + freelancer list. */
export function TalentSearchPage({ q }: { q: string }) {
  const router = useRouter();
  const { data: freelancers, isPending, isError, refetch } = useFreelancers();
  const [search, setSearch] = useAdjustedState(q);
  const [filters, setFilters] = useState<ITalentFilters>(EMPTY_TALENT_FILTERS);

  const updateSearch = (value: string) => {
    setSearch(value);
    router.replace(
      `/marketplace/talent${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`,
      { scroll: false },
    );
  };

  const results = freelancers ? filterFreelancers(freelancers, search, filters) : [];

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
      <TalentFiltersRail freelancers={freelancers ?? []} filters={filters} onChange={setFilters} />

      <div className="min-w-0">
        <SearchInput
          value={search}
          onChange={updateSearch}
          placeholder="Search for talent"
          className="max-w-xl"
        />

        {isPending ? (
          <div className="mt-4">
            <ListSkeleton rows={4} />
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load talent"
            description="Something went wrong while loading freelancers."
            actions={[{ label: "Try again", onClick: () => refetch() }]}
          />
        ) : results.length === 0 ? (
          <EmptyState
            assetKey="search-empty"
            title="No freelancers match your search"
            description="Try different keywords or remove some filters."
            actions={[
              {
                label: "Clear search & filters",
                onClick: () => {
                  updateSearch("");
                  setFilters(EMPTY_TALENT_FILTERS);
                },
              },
            ]}
          />
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "freelancer" : "freelancers"} found
            </p>
            <div className="mt-2 flex flex-col divide-y">
              {results.map((freelancer) => (
                <FreelancerCard key={freelancer.id} freelancer={freelancer} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
