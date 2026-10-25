import type { IFreelancer, IMarketplaceJob } from "@/types";
import type { EExperienceLevel, EJobType, ETalentBadge } from "@/types";

/** Pure filter/sort/search for marketplace search pages. Never mutates input. */

export type EClientHistoryBucket = "none" | "1-9" | "10+";
export type EJobSort = "newest" | "best_match";
export type ERateBucket = "any" | "lt25" | "25-50" | "gt50";

export interface IJobFilters {
  experience: EExperienceLevel[];
  jobType: EJobType[];
  clientHistory: EClientHistoryBucket[];
}

export interface ITalentFilters {
  badges: ETalentBadge[];
  rate: ERateBucket;
  availableNow: boolean;
}

export const EMPTY_JOB_FILTERS: IJobFilters = { experience: [], jobType: [], clientHistory: [] };
export const EMPTY_TALENT_FILTERS: ITalentFilters = { badges: [], rate: "any", availableNow: false };

export function clientHistoryBucket(hires: number): EClientHistoryBucket {
  if (hires === 0) return "none";
  return hires >= 10 ? "10+" : "1-9";
}

const matches = (q: string, haystack: string[]): boolean => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.some((h) => h.toLowerCase().includes(needle));
};

export function filterJobs(jobs: IMarketplaceJob[], q: string, f: IJobFilters): IMarketplaceJob[] {
  return jobs.filter((job) => {
    if (!matches(q, [job.title, job.description, ...job.skills])) return false;
    if (f.experience.length && !f.experience.includes(job.experience_level)) return false;
    if (f.jobType.length && !f.jobType.includes(job.job_type)) return false;
    if (f.clientHistory.length && !f.clientHistory.includes(clientHistoryBucket(job.client.hires))) return false;
    return true;
  });
}

export function sortJobs(jobs: IMarketplaceJob[], sort: EJobSort): IMarketplaceJob[] {
  if (sort === "best_match") return [...jobs];
  return jobs.toSorted(
    (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
  );
}

const inRateBucket = (rate: number, bucket: ERateBucket): boolean => {
  switch (bucket) {
    case "any": return true;
    case "lt25": return rate < 25;
    case "25-50": return rate >= 25 && rate <= 50;
    case "gt50": return rate > 50;
  }
};

export function filterFreelancers(list: IFreelancer[], q: string, f: ITalentFilters): IFreelancer[] {
  return list.filter((fl) => {
    if (!matches(q, [fl.name, fl.title, fl.overview, ...fl.skills])) return false;
    if (f.badges.length && (!fl.badge || !f.badges.includes(fl.badge))) return false;
    if (!inRateBucket(fl.hourly_rate, f.rate)) return false;
    if (f.availableNow && !fl.available_now) return false;
    return true;
  });
}
