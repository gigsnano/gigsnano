import { describe, expect, it } from "vitest";

import { EMarketplaceRole } from "@/types";

import { profileChecklist, profileCompleteness } from "./marketplace-profile-completeness";

const freelancer = {
  role: EMarketplaceRole.Freelancer,
  display_name: "Ada L.",
  title: "Frontend Engineer",
  hourly_rate: 45,
  skills: ["React"],
  overview: "",
  company_name: "",
  industry: "",
  company_size: "",
};

describe("profileCompleteness", () => {
  it("sums the completed checklist weights", () => {
    // name 20 + title 20 + rate 20 + skills 20; overview (20) missing
    expect(profileCompleteness(freelancer)).toBe(80);
    expect(profileCompleteness({ ...freelancer, overview: "Hi" })).toBe(100);
  });

  it("client checklist uses company fields", () => {
    const client = {
      ...freelancer,
      role: EMarketplaceRole.Client,
      title: "",
      hourly_rate: null,
      skills: [],
      company_name: "Acme",
      industry: "Tech & IT",
      company_size: "Individual client",
    };
    expect(profileCompleteness(client)).toBe(100);
    expect(profileCompleteness({ ...client, company_name: "" })).toBe(75);
  });

  it("checklist rows carry weight labels and done flags", () => {
    const rows = profileChecklist(freelancer);
    const overview = rows.find((r) => r.key === "overview");
    expect(overview?.done).toBe(false);
    expect(overview?.weight).toBe(20);
    expect(rows.filter((r) => r.done)).toHaveLength(4);
  });
});
