import { describe, expect, it } from "vitest";

import { validatePolicy, type IVoicePolicyDraft } from "@/lib/voice/policy-validation";

function draft(over: Partial<IVoicePolicyDraft> = {}): IVoicePolicyDraft {
  return {
    enabled: true,
    region: "uae-north",
    deployment: "voice-prod",
    locales: ["en-AE"],
    requireConfirmation: true,
    retainRawAudio: false,
    transcriptRetentionDays: 30,
    monthlyMinutesQuota: 600,
    secretRef: "kv://voice/uae-north/key",
    ...over,
  };
}

describe("voice policy validation", () => {
  it("accepts a coherent configuration", () => {
    expect(validatePolicy(draft())).toEqual([]);
  });

  it("rejects a locale the region does not serve", () => {
    // The AC: invalid region/deployment/locale combinations cannot be published.
    const problems = validatePolicy(draft({ region: "east-us", locales: ["ar-AE"] }));
    expect(problems.join(" ")).toContain("ar-AE");
  });

  it("rejects an unknown region", () => {
    expect(validatePolicy(draft({ region: "mars-central" })).join(" ")).toContain("not a supported");
  });

  it("requires at least one locale", () => {
    expect(validatePolicy(draft({ locales: [] })).join(" ")).toContain("at least one locale");
  });

  it("requires a deployment", () => {
    expect(validatePolicy(draft({ deployment: "  " })).join(" ")).toContain("deployment name");
  });

  it("refuses to let a workspace switch confirmation off", () => {
    // The platform floor from GIN-517, enforced at edit time so the admin is
    // told why here rather than by a publish that mysteriously fails.
    expect(validatePolicy(draft({ requireConfirmation: false })).join(" ")).toContain(
      "cannot be switched off",
    );
  });

  it("bounds transcript retention", () => {
    expect(validatePolicy(draft({ transcriptRetentionDays: -1 })).length).toBe(1);
    expect(validatePolicy(draft({ transcriptRetentionDays: 400 })).length).toBe(1);
    expect(validatePolicy(draft({ transcriptRetentionDays: 0 })).length).toBe(0);
  });
});
