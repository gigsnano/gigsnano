/** Marketplace API contract. Mock-only domain — no backend yet. */

export enum EMarketplaceRole {
  Client = "client",
  Freelancer = "freelancer",
}

export enum EJobType {
  Hourly = "hourly",
  Fixed = "fixed",
}

export enum EExperienceLevel {
  Entry = "entry",
  Intermediate = "intermediate",
  Expert = "expert",
}

export enum ETalentBadge {
  TopRatedPlus = "top_rated_plus",
  TopRated = "top_rated",
  RisingTalent = "rising_talent",
}

export interface IJobClient {
  payment_verified: boolean;
  /** 0–5, one decimal. 0 = no reviews yet. */
  rating: number;
  reviews_count: number;
  total_spent_usd: number;
  avg_hourly_paid: number | null;
  hires: number;
  country: string;
  jobs_posted: number;
  hire_rate_pct: number;
  industry: string;
  company_size: string;
  member_since: string;
}

export interface IMarketplaceJob {
  id: string;
  title: string;
  /** Plain text; paragraphs separated by \n\n. */
  description: string;
  posted_at: string;
  job_type: EJobType;
  hourly_min: number | null;
  hourly_max: number | null;
  fixed_budget: number | null;
  experience_level: EExperienceLevel;
  duration_label: string;
  hours_per_week_label: string;
  category: string;
  skills: string[];
  proposals_label: string;
  interviewing: number;
  invites_sent: number;
  client: IJobClient;
}

export interface IWorkHistoryItem {
  title: string;
  rating: number;
  period_label: string;
  amount_label: string;
  feedback: string;
}

export interface IFreelancer {
  id: string;
  name: string;
  avatar_url: string | null;
  title: string;
  country: string;
  city: string;
  hourly_rate: number;
  job_success_pct: number;
  badge: ETalentBadge | null;
  total_earned_label: string;
  jobs_count: number;
  hours_worked: number;
  available_now: boolean;
  skills: string[];
  /** Plain text; paragraphs separated by \n\n. */
  overview: string;
  languages: string[];
  verifications: string[];
  hours_per_week_label: string;
  member_since: string;
  work_history: IWorkHistoryItem[];
}
