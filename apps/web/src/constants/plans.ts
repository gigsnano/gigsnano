/** Subscription tiers (GIN-30). Enterprise/usage-metering are out of scope. */
export enum EPlanTier {
  Free = "free",
  Pro = "pro",
  Business = "business",
}

export enum EBillingInterval {
  Monthly = "monthly",
  Annual = "annual",
}

/** Boolean feature gates. Add a value here to introduce a new gate (open/closed). */
export enum EEntitlementFeature {
  AdvancedAnalytics = "advanced_analytics",
  Integrations = "integrations",
  Imports = "imports",
  CustomWorkItemTypes = "custom_work_item_types",
  ProjectAutomations = "project_automations",
  CodingAgentDelegation = "coding_agent_delegation",
  Webhooks = "webhooks",
  PublicApi = "public_api",
  Sso = "sso",
  PrioritySupport = "priority_support",
}

/** Numeric caps. `null` in a tier's `limits` means unlimited. */
export enum EEntitlementLimit {
  Seats = "seats",
  Projects = "projects",
  AiCreditsPerSeat = "ai_credits_per_seat",
}

export interface IPlanTierDef {
  tier: EPlanTier;
  name: string;
  tagline: string;
  /** Per-seat monthly price in cents. `null` = custom / contact sales. */
  monthlyPriceCents: number | null;
  highlighted?: boolean;
  /** Granted feature list — extend a tier by adding a value here. */
  features: EEntitlementFeature[];
  /** Numeric caps; `null` = unlimited. */
  limits: Record<EEntitlementLimit, number | null>;
  /** Human-readable bullets for pricing cards. */
  marketingBullets: string[];
}

const PRO_FEATURES = [
  EEntitlementFeature.AdvancedAnalytics,
  EEntitlementFeature.Integrations,
  EEntitlementFeature.Imports,
  EEntitlementFeature.CustomWorkItemTypes,
  EEntitlementFeature.ProjectAutomations,
  EEntitlementFeature.CodingAgentDelegation,
];

const BUSINESS_FEATURES = [
  ...PRO_FEATURES,
  EEntitlementFeature.Webhooks,
  EEntitlementFeature.PublicApi,
  EEntitlementFeature.Sso,
  EEntitlementFeature.PrioritySupport,
];

export const PLAN_TIERS: Record<EPlanTier, IPlanTierDef> = {
  [EPlanTier.Free]: {
    tier: EPlanTier.Free,
    name: "Free",
    tagline: "For a first project and Sprint-0.",
    monthlyPriceCents: 0,
    features: [],
    limits: {
      [EEntitlementLimit.Seats]: 5,
      [EEntitlementLimit.Projects]: 3,
      [EEntitlementLimit.AiCreditsPerSeat]: 500,
    },
    marketingBullets: [
      "Up to 5 members",
      "3 projects",
      "Full Sprint-0 with BMAD agents",
      "500 AI credits / seat",
      "Community support",
    ],
  },
  [EPlanTier.Pro]: {
    tier: EPlanTier.Pro,
    name: "Pro",
    tagline: "For teams shipping continuously.",
    monthlyPriceCents: 800,
    highlighted: true,
    features: PRO_FEATURES,
    limits: {
      [EEntitlementLimit.Seats]: null,
      [EEntitlementLimit.Projects]: null,
      [EEntitlementLimit.AiCreditsPerSeat]: 1000,
    },
    marketingBullets: [
      "Everything in Free",
      "Unlimited members & projects",
      "Advanced analytics",
      "Integrations, imports & automations",
      "Custom work-item types",
      "Coding-agent delegation",
      "1,000 AI credits / seat",
    ],
  },
  [EPlanTier.Business]: {
    tier: EPlanTier.Business,
    name: "Business",
    tagline: "For orgs with scale and controls.",
    monthlyPriceCents: 1500,
    features: BUSINESS_FEATURES,
    limits: {
      [EEntitlementLimit.Seats]: null,
      [EEntitlementLimit.Projects]: null,
      [EEntitlementLimit.AiCreditsPerSeat]: 2000,
    },
    marketingBullets: [
      "Everything in Pro",
      "Webhooks & public API",
      "SSO & advanced security",
      "2,000 AI credits / seat",
      "Priority support",
    ],
  },
};

export const PLAN_TIER_ORDER: EPlanTier[] = [EPlanTier.Free, EPlanTier.Pro, EPlanTier.Business];

/** Annual billing charges (12 − discount) months up front. */
export const ANNUAL_DISCOUNT_MONTHS = 2;

export function annualTotalCents(monthlyCents: number): number {
  return monthlyCents * (12 - ANNUAL_DISCOUNT_MONTHS);
}

export function annualMonthlyEquivalentCents(monthlyCents: number): number {
  return Math.round(annualTotalCents(monthlyCents) / 12);
}
