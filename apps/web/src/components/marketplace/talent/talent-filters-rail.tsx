"use client";

import { Button } from "@/components/ui/button";
import type { ERateBucket, ITalentFilters } from "@/lib/marketplace/marketplace-filtering";
import { EMPTY_TALENT_FILTERS } from "@/lib/marketplace/marketplace-filtering";
import type { IFreelancer } from "@/types";
import { ETalentBadge } from "@/types";

import { FilterOption, FilterSection } from "../shared/filter-section";
import { TALENT_BADGE_LABELS } from "../shared/talent-badge-labels";

const RATE_LABELS: Record<ERateBucket, string> = {
  any: "Any hourly rate",
  lt25: "Under $25/hr",
  "25-50": "$25–$50/hr",
  gt50: "$50+/hr",
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Left filter rail on talent search (Badges · Hourly rate · Availability). */
export function TalentFiltersRail({
  freelancers,
  filters,
  onChange,
}: {
  freelancers: IFreelancer[];
  filters: ITalentFilters;
  onChange: (filters: ITalentFilters) => void;
}) {
  const anyActive =
    filters.badges.length > 0 || filters.rate !== "any" || filters.availableNow;

  return (
    <aside className="sticky top-20 hidden self-start lg:block" aria-label="Talent filters">
      <div className="mb-2 flex h-8 items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {anyActive && (
          <Button variant="ghost" size="xs" onClick={() => onChange(EMPTY_TALENT_FILTERS)}>
            Clear all
          </Button>
        )}
      </div>

      <FilterSection title="Talent badges">
        {Object.values(ETalentBadge).map((badge) => (
          <FilterOption
            key={badge}
            label={TALENT_BADGE_LABELS[badge]}
            count={freelancers.filter((f) => f.badge === badge).length}
            checked={filters.badges.includes(badge)}
            onChange={() => onChange({ ...filters, badges: toggle(filters.badges, badge) })}
          />
        ))}
      </FilterSection>

      <FilterSection title="Hourly rate">
        {(Object.keys(RATE_LABELS) as ERateBucket[]).map((bucket) => (
          <FilterOption
            key={bucket}
            type="radio"
            name="talent-rate"
            label={RATE_LABELS[bucket]}
            checked={filters.rate === bucket}
            onChange={() => onChange({ ...filters, rate: bucket })}
          />
        ))}
      </FilterSection>

      <FilterSection title="Availability">
        <FilterOption
          label="Available now"
          count={freelancers.filter((f) => f.available_now).length}
          checked={filters.availableNow}
          onChange={() => onChange({ ...filters, availableNow: !filters.availableNow })}
        />
      </FilterSection>
    </aside>
  );
}
