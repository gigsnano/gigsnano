import { describe, expect, it } from "vitest";

import type { IFreelancer, IMarketplaceJob } from "@/types";
import { EExperienceLevel, EJobType, ETalentBadge } from "@/types";

import {
  EMPTY_JOB_FILTERS,
  EMPTY_TALENT_FILTERS,
  clientHistoryBucket,
  filterFreelancers,
  filterJobs,
  sortJobs,
} from "./marketplace-filtering";

const makeJob = (overrides: Partial<IMarketplaceJob> = {}): IMarketplaceJob => ({
  id: "j1",
  title: "React Developer",
  description: "Build a dashboard",
  posted_at: "2026-07-01T00:00:00Z",
  job_type: EJobType.Hourly,
  hourly_min: 20,
  hourly_max: 40,
  fixed_budget: null,
  experience_level: EExperienceLevel.Intermediate,
  duration_label: "Less than 1 month",
  hours_per_week_label: "Less than 30 hrs/week",
  category: "Web Development",
  skills: ["React", "CSS"],
  proposals_label: "5 to 10",
  interviewing: 0,
  invites_sent: 0,
  client: {
    payment_verified: true,
    rating: 5,
    reviews_count: 3,
    total_spent_usd: 1000,
    avg_hourly_paid: 25,
    hires: 3,
    country: "Norway",
    jobs_posted: 4,
    hire_rate_pct: 75,
    industry: "Tech & IT",
    company_size: "Individual client",
    member_since: "May 2024",
  },
  ...overrides,
});

const makeFreelancer = (overrides: Partial<IFreelancer> = {}): IFreelancer => ({
  id: "f1",
  name: "Ada L.",
  avatar_url: null,
  title: "Frontend Engineer",
  country: "UK",
  city: "London",
  hourly_rate: 30,
  job_success_pct: 98,
  badge: null,
  total_earned_label: "$10K+",
  jobs_count: 10,
  hours_worked: 500,
  available_now: false,
  skills: ["React"],
  overview: "I build UIs",
  languages: ["English: Native"],
  verifications: ["ID verified"],
  hours_per_week_label: "As needed",
  member_since: "Jan 2020",
  work_history: [],
  ...overrides,
});

describe("clientHistoryBucket", () => {
  it("buckets hires into none / 1-9 / 10+", () => {
    expect(clientHistoryBucket(0)).toBe("none");
    expect(clientHistoryBucket(1)).toBe("1-9");
    expect(clientHistoryBucket(9)).toBe("1-9");
    expect(clientHistoryBucket(10)).toBe("10+");
    expect(clientHistoryBucket(48)).toBe("10+");
  });
});

describe("filterJobs", () => {
  it("matches q against title, description and skills, case-insensitively", () => {
    const jobs = [
      makeJob({ id: "a", title: "Python Scraper" , skills: ["Python"], description: "scrape sites" }),
      makeJob({ id: "b", title: "Designer", skills: ["Figma"], description: "brand work" }),
    ];
    expect(filterJobs(jobs, "python", EMPTY_JOB_FILTERS).map((j) => j.id)).toEqual(["a"]);
    expect(filterJobs(jobs, "FIGMA", EMPTY_JOB_FILTERS).map((j) => j.id)).toEqual(["b"]);
    expect(filterJobs(jobs, "", EMPTY_JOB_FILTERS)).toHaveLength(2);
  });

  it("applies experience, job type and client-history facets (AND across facets)", () => {
    const jobs = [
      makeJob({ id: "a", experience_level: EExperienceLevel.Entry, job_type: EJobType.Fixed, client: { ...makeJob().client, hires: 0 } }),
      makeJob({ id: "b", experience_level: EExperienceLevel.Expert, job_type: EJobType.Hourly, client: { ...makeJob().client, hires: 25 } }),
      makeJob({ id: "c", experience_level: EExperienceLevel.Expert, job_type: EJobType.Fixed, client: { ...makeJob().client, hires: 5 } }),
    ];
    expect(
      filterJobs(jobs, "", { ...EMPTY_JOB_FILTERS, experience: [EExperienceLevel.Expert] }).map((j) => j.id),
    ).toEqual(["b", "c"]);
    expect(
      filterJobs(jobs, "", { ...EMPTY_JOB_FILTERS, jobType: [EJobType.Fixed] }).map((j) => j.id),
    ).toEqual(["a", "c"]);
    expect(
      filterJobs(jobs, "", {
        experience: [EExperienceLevel.Expert],
        jobType: [EJobType.Fixed],
        clientHistory: ["1-9"],
      }).map((j) => j.id),
    ).toEqual(["c"]);
  });

  it("treats empty facet arrays as inactive", () => {
    const jobs = [makeJob({ id: "a" }), makeJob({ id: "b" })];
    expect(filterJobs(jobs, "", EMPTY_JOB_FILTERS)).toHaveLength(2);
  });
});

describe("sortJobs", () => {
  it("newest sorts by posted_at desc without mutating input", () => {
    const jobs = [
      makeJob({ id: "old", posted_at: "2026-06-01T00:00:00Z" }),
      makeJob({ id: "new", posted_at: "2026-07-03T00:00:00Z" }),
      makeJob({ id: "mid", posted_at: "2026-06-20T00:00:00Z" }),
    ];
    const sorted = sortJobs(jobs, "newest");
    expect(sorted.map((j) => j.id)).toEqual(["new", "mid", "old"]);
    expect(jobs.map((j) => j.id)).toEqual(["old", "new", "mid"]);
  });

  it("best_match preserves fixture order", () => {
    const jobs = [makeJob({ id: "a" }), makeJob({ id: "b" })];
    expect(sortJobs(jobs, "best_match").map((j) => j.id)).toEqual(["a", "b"]);
  });
});

describe("filterFreelancers", () => {
  it("matches q against name, title, skills and overview", () => {
    const list = [
      makeFreelancer({ id: "a", name: "Grace H.", title: "Data Scientist", skills: ["Python"], overview: "ML pipelines" }),
      makeFreelancer({ id: "b", name: "Ada L.", title: "Frontend Engineer", skills: ["React"], overview: "I build UIs" }),
    ];
    expect(filterFreelancers(list, "data", EMPTY_TALENT_FILTERS).map((f) => f.id)).toEqual(["a"]);
    expect(filterFreelancers(list, "react", EMPTY_TALENT_FILTERS).map((f) => f.id)).toEqual(["b"]);
  });

  it("applies rate buckets at the edges", () => {
    const list = [
      makeFreelancer({ id: "cheap", hourly_rate: 24.99 }),
      makeFreelancer({ id: "lo", hourly_rate: 25 }),
      makeFreelancer({ id: "hi", hourly_rate: 50 }),
      makeFreelancer({ id: "prem", hourly_rate: 51 }),
    ];
    expect(filterFreelancers(list, "", { ...EMPTY_TALENT_FILTERS, rate: "lt25" }).map((f) => f.id)).toEqual(["cheap"]);
    expect(filterFreelancers(list, "", { ...EMPTY_TALENT_FILTERS, rate: "25-50" }).map((f) => f.id)).toEqual(["lo", "hi"]);
    expect(filterFreelancers(list, "", { ...EMPTY_TALENT_FILTERS, rate: "gt50" }).map((f) => f.id)).toEqual(["prem"]);
    expect(filterFreelancers(list, "", EMPTY_TALENT_FILTERS)).toHaveLength(4);
  });

  it("applies badges and availability", () => {
    const list = [
      makeFreelancer({ id: "a", badge: ETalentBadge.TopRated, available_now: false }),
      makeFreelancer({ id: "b", badge: ETalentBadge.RisingTalent, available_now: true }),
      makeFreelancer({ id: "c", badge: null, available_now: true }),
    ];
    expect(
      filterFreelancers(list, "", { ...EMPTY_TALENT_FILTERS, badges: [ETalentBadge.TopRated] }).map((f) => f.id),
    ).toEqual(["a"]);
    expect(
      filterFreelancers(list, "", { ...EMPTY_TALENT_FILTERS, availableNow: true }).map((f) => f.id),
    ).toEqual(["b", "c"]);
    expect(
      filterFreelancers(list, "", { ...EMPTY_TALENT_FILTERS, badges: [ETalentBadge.RisingTalent], availableNow: true }).map((f) => f.id),
    ).toEqual(["b"]);
  });
});
