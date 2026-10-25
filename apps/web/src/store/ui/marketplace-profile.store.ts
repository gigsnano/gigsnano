import { create } from "zustand";
import { persist } from "zustand/middleware";

import { EMarketplaceRole } from "@/types";

export enum EVerifyStatus {
  Unverified = "unverified",
  Pending = "pending",
  Verified = "verified",
}

export interface IProfileLanguage {
  name: string;
  proficiency: string;
}

export interface IPortfolioProject {
  id: string;
  title: string;
  description: string;
  image_url: string;
  skills: string[];
  published: boolean;
}

export interface IOnboardingPayload {
  role: EMarketplaceRole;
  display_name: string;
  /** Freelancer fields */
  title?: string;
  hourly_rate?: number | null;
  skills?: string[];
  /** Client fields */
  company_name?: string;
  industry?: string;
  company_size?: string;
}

export interface IProfilePatch {
  display_name?: string;
  title?: string;
  hourly_rate?: number | null;
  skills?: string[];
  overview?: string;
  company_name?: string;
  industry?: string;
  company_size?: string;
  hours_per_week?: string;
  video_intro_url?: string;
  profile_public?: boolean;
}

interface IMarketplaceProfileStore {
  role: EMarketplaceRole | null;
  onboarded: boolean;
  display_name: string;
  title: string;
  hourly_rate: number | null;
  skills: string[];
  overview: string;
  company_name: string;
  industry: string;
  company_size: string;
  saved_job_ids: string[];
  hours_per_week: string;
  languages: IProfileLanguage[];
  video_intro_url: string;
  portfolio: IPortfolioProject[];
  identity_verification: EVerifyStatus;
  phone_verification: EVerifyStatus;
  profile_public: boolean;
  completeOnboarding: (payload: IOnboardingPayload) => void;
  updateProfile: (patch: IProfilePatch) => void;
  toggleSavedJob: (jobId: string) => void;
  addLanguage: (lang: IProfileLanguage) => void;
  removeLanguage: (name: string) => void;
  upsertPortfolioProject: (project: IPortfolioProject) => void;
  removePortfolioProject: (id: string) => void;
  setVerification: (kind: "identity" | "phone", status: EVerifyStatus) => void;
  reset: () => void;
}

const DEFAULTS = {
  role: null,
  onboarded: false,
  display_name: "",
  title: "",
  hourly_rate: null,
  skills: [] as string[],
  overview: "",
  company_name: "",
  industry: "",
  company_size: "",
  saved_job_ids: [] as string[],
  hours_per_week: "",
  languages: [] as IProfileLanguage[],
  video_intro_url: "",
  portfolio: [] as IPortfolioProject[],
  identity_verification: EVerifyStatus.Unverified,
  phone_verification: EVerifyStatus.Unverified,
  profile_public: true,
};

/**
 * Marketplace onboarding profile + saved jobs. Pure UI state (no backend for
 * the marketplace yet), persisted so the onboarding gate survives reloads.
 */
export const useMarketplaceProfileStore = create<IMarketplaceProfileStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      completeOnboarding: (p) =>
        set({
          role: p.role,
          onboarded: true,
          display_name: p.display_name,
          title: p.title ?? "",
          hourly_rate: p.hourly_rate ?? null,
          skills: p.skills ?? [],
          company_name: p.company_name ?? "",
          industry: p.industry ?? "",
          company_size: p.company_size ?? "",
        }),
      updateProfile: (patch) => set(patch),
      toggleSavedJob: (jobId) =>
        set((s) => ({
          saved_job_ids: s.saved_job_ids.includes(jobId)
            ? s.saved_job_ids.filter((id) => id !== jobId)
            : [...s.saved_job_ids, jobId],
        })),
      addLanguage: (lang) =>
        set((s) =>
          s.languages.some((l) => l.name.toLowerCase() === lang.name.toLowerCase())
            ? {}
            : { languages: [...s.languages, lang] },
        ),
      removeLanguage: (name) =>
        set((s) => ({ languages: s.languages.filter((l) => l.name !== name) })),
      upsertPortfolioProject: (project) =>
        set((s) => ({
          portfolio: s.portfolio.some((p) => p.id === project.id)
            ? s.portfolio.map((p) => (p.id === project.id ? project : p))
            : [...s.portfolio, project],
        })),
      removePortfolioProject: (id) =>
        set((s) => ({ portfolio: s.portfolio.filter((p) => p.id !== id) })),
      setVerification: (kind, status) =>
        set(kind === "identity" ? { identity_verification: status } : { phone_verification: status }),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: "gn.marketplace-profile" },
  ),
);
