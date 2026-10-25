/**
 * Voice policy shape and validation (GIN-516).
 *
 * Split out of the settings component so Fast Refresh can preserve that
 * component's state, and so the rules are testable without mounting a form.
 *
 * Locales are stored as `Set`s: they are membership-checked once per rendered
 * chip and once per locale on validate, which is a scan of the whole list every
 * time with an array.
 */

export interface IVoicePolicyDraft {
  enabled: boolean;
  region: string;
  deployment: string;
  locales: string[];
  requireConfirmation: boolean;
  retainRawAudio: boolean;
  transcriptRetentionDays: number;
  monthlyMinutesQuota: number;
  secretRef: string;
}

/** Region/locale pairs the provider actually serves. */
export const REGION_LOCALES: Record<string, ReadonlySet<string>> = {
  "uae-north": new Set(["en-AE", "ar-AE"]),
  "west-europe": new Set(["en-GB", "de-DE", "fr-FR"]),
  "east-us": new Set(["en-US", "es-US"]),
};

export const REGIONS = Object.keys(REGION_LOCALES);

export function localesFor(region: string): string[] {
  return [...(REGION_LOCALES[region] ?? [])];
}

export function validatePolicy(draft: IVoicePolicyDraft): string[] {
  const problems: string[] = [];
  const supported = REGION_LOCALES[draft.region];

  if (!supported) {
    problems.push(`${draft.region || "No region"} is not a supported region.`);
  } else {
    const unsupported = draft.locales.filter((locale) => !supported.has(locale));
    if (unsupported.length) {
      problems.push(`${unsupported.join(", ")} not available in ${draft.region}.`);
    }
  }
  if (!draft.locales.length) problems.push("Pick at least one locale.");
  if (!draft.deployment.trim()) problems.push("A deployment name is required.");
  // The platform floor from GIN-517, restated here so the admin is refused at
  // the point of editing rather than by a publish that mysteriously fails.
  if (!draft.requireConfirmation) {
    problems.push("Confirmation for material writes cannot be switched off.");
  }
  if (draft.transcriptRetentionDays < 0 || draft.transcriptRetentionDays > 365) {
    problems.push("Transcript retention must be between 0 and 365 days.");
  }
  return problems;
}
