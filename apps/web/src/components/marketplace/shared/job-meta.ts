import type { IMarketplaceJob } from "@/types";
import { EExperienceLevel, EJobType } from "@/types";

export const EXPERIENCE_LABELS: Record<EExperienceLevel, string> = {
  [EExperienceLevel.Entry]: "Entry level",
  [EExperienceLevel.Intermediate]: "Intermediate",
  [EExperienceLevel.Expert]: "Expert",
};

export function formatJobRate(job: IMarketplaceJob): string {
  if (job.job_type === EJobType.Fixed) {
    return `Fixed price: $${(job.fixed_budget ?? 0).toLocaleString()}`;
  }
  if (job.hourly_min != null && job.hourly_max != null) {
    return `Hourly: $${job.hourly_min}–$${job.hourly_max}`;
  }
  return "Hourly";
}
