import type { IMarketplaceJob } from "@/types";

import { EXPERIENCE_LABELS, formatJobRate } from "./job-meta";

/** "Hourly: $25–$50 · Expert · Est. time: Less than 1 month" line. */
export function JobMetaLine({ job }: { job: IMarketplaceJob }) {
  return (
    <p className="text-xs text-muted-foreground">
      {formatJobRate(job)}
      <span className="mx-1.5" aria-hidden>
        ·
      </span>
      {EXPERIENCE_LABELS[job.experience_level]}
      <span className="mx-1.5" aria-hidden>
        ·
      </span>
      Est. time: {job.duration_label}, {job.hours_per_week_label}
    </p>
  );
}
