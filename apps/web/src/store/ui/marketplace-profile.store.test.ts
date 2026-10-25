import { beforeEach, describe, expect, it } from "vitest";

import { EMarketplaceRole } from "@/types";

import { EVerifyStatus, useMarketplaceProfileStore } from "./marketplace-profile.store";

describe("marketplace profile store", () => {
  beforeEach(() => {
    useMarketplaceProfileStore.getState().reset();
  });

  it("starts not onboarded", () => {
    const s = useMarketplaceProfileStore.getState();
    expect(s.onboarded).toBe(false);
    expect(s.role).toBeNull();
    expect(s.saved_job_ids).toEqual([]);
  });

  it("completeOnboarding stores freelancer profile fields", () => {
    useMarketplaceProfileStore.getState().completeOnboarding({
      role: EMarketplaceRole.Freelancer,
      display_name: "Ada L.",
      title: "Frontend Engineer",
      hourly_rate: 45,
      skills: ["React", "CSS"],
    });
    const s = useMarketplaceProfileStore.getState();
    expect(s.onboarded).toBe(true);
    expect(s.role).toBe(EMarketplaceRole.Freelancer);
    expect(s.display_name).toBe("Ada L.");
    expect(s.hourly_rate).toBe(45);
    expect(s.skills).toEqual(["React", "CSS"]);
  });

  it("completeOnboarding stores client profile fields", () => {
    useMarketplaceProfileStore.getState().completeOnboarding({
      role: EMarketplaceRole.Client,
      display_name: "Sam K.",
      company_name: "Acme Corp",
      industry: "Tech & IT",
      company_size: "Small company (2-9 people)",
    });
    const s = useMarketplaceProfileStore.getState();
    expect(s.onboarded).toBe(true);
    expect(s.role).toBe(EMarketplaceRole.Client);
    expect(s.company_name).toBe("Acme Corp");
  });

  it("toggleSavedJob adds then removes", () => {
    const { toggleSavedJob } = useMarketplaceProfileStore.getState();
    toggleSavedJob("mj-1");
    expect(useMarketplaceProfileStore.getState().saved_job_ids).toEqual(["mj-1"]);
    useMarketplaceProfileStore.getState().toggleSavedJob("mj-2");
    expect(useMarketplaceProfileStore.getState().saved_job_ids).toEqual(["mj-1", "mj-2"]);
    useMarketplaceProfileStore.getState().toggleSavedJob("mj-1");
    expect(useMarketplaceProfileStore.getState().saved_job_ids).toEqual(["mj-2"]);
  });

  it("updateProfile patches fields without touching others", () => {
    useMarketplaceProfileStore.getState().completeOnboarding({
      role: EMarketplaceRole.Freelancer,
      display_name: "Ada L.",
      title: "Frontend Engineer",
    });
    useMarketplaceProfileStore.getState().updateProfile({ overview: "I build UIs", hourly_rate: 50 });
    const s = useMarketplaceProfileStore.getState();
    expect(s.overview).toBe("I build UIs");
    expect(s.hourly_rate).toBe(50);
    expect(s.title).toBe("Frontend Engineer");
    expect(s.onboarded).toBe(true);
  });

  it("reset returns to defaults", () => {
    useMarketplaceProfileStore.getState().completeOnboarding({
      role: EMarketplaceRole.Client,
      display_name: "Sam K.",
    });
    useMarketplaceProfileStore.getState().toggleSavedJob("mj-1");
    useMarketplaceProfileStore.getState().reset();
    const s = useMarketplaceProfileStore.getState();
    expect(s.onboarded).toBe(false);
    expect(s.display_name).toBe("");
    expect(s.saved_job_ids).toEqual([]);
  });

  it("has empty defaults for the new profile fields", () => {
    const s = useMarketplaceProfileStore.getState();
    expect(s.hours_per_week).toBe("");
    expect(s.languages).toEqual([]);
    expect(s.video_intro_url).toBe("");
    expect(s.portfolio).toEqual([]);
    expect(s.identity_verification).toBe(EVerifyStatus.Unverified);
    expect(s.phone_verification).toBe(EVerifyStatus.Unverified);
    expect(s.profile_public).toBe(true);
  });

  it("addLanguage adds and dedupes case-insensitively; removeLanguage removes", () => {
    const st = () => useMarketplaceProfileStore.getState();
    st().addLanguage({ name: "English", proficiency: "Fluent" });
    st().addLanguage({ name: "english", proficiency: "Native or Bilingual" }); // dup
    expect(st().languages).toEqual([{ name: "English", proficiency: "Fluent" }]);
    st().addLanguage({ name: "Spanish", proficiency: "Conversational" });
    expect(st().languages).toHaveLength(2);
    st().removeLanguage("English");
    expect(st().languages).toEqual([{ name: "Spanish", proficiency: "Conversational" }]);
  });

  it("upsertPortfolioProject appends new and replaces by id; removePortfolioProject removes", () => {
    const st = () => useMarketplaceProfileStore.getState();
    const p = { id: "p1", title: "Site", description: "d", image_url: "", skills: [], published: true };
    st().upsertPortfolioProject(p);
    expect(st().portfolio).toEqual([p]);
    st().upsertPortfolioProject({ ...p, title: "Site v2" });
    expect(st().portfolio).toHaveLength(1);
    expect(st().portfolio[0].title).toBe("Site v2");
    st().removePortfolioProject("p1");
    expect(st().portfolio).toEqual([]);
  });

  it("setVerification updates only the targeted kind", () => {
    const st = () => useMarketplaceProfileStore.getState();
    st().setVerification("identity", EVerifyStatus.Verified);
    expect(st().identity_verification).toBe(EVerifyStatus.Verified);
    expect(st().phone_verification).toBe(EVerifyStatus.Unverified);
  });

  it("updateProfile patches the new scalar fields without touching others", () => {
    const st = () => useMarketplaceProfileStore.getState();
    st().updateProfile({ hours_per_week: "Less than 30 hrs/week", video_intro_url: "https://x.test/v", profile_public: false });
    expect(st().hours_per_week).toBe("Less than 30 hrs/week");
    expect(st().video_intro_url).toBe("https://x.test/v");
    expect(st().profile_public).toBe(false);
  });

  it("reset restores all new fields to defaults", () => {
    const st = () => useMarketplaceProfileStore.getState();
    st().addLanguage({ name: "English", proficiency: "Fluent" });
    st().setVerification("identity", EVerifyStatus.Verified);
    st().updateProfile({ hours_per_week: "x", profile_public: false });
    st().reset();
    const s = st();
    expect(s.languages).toEqual([]);
    expect(s.identity_verification).toBe(EVerifyStatus.Unverified);
    expect(s.hours_per_week).toBe("");
    expect(s.profile_public).toBe(true);
  });
});
