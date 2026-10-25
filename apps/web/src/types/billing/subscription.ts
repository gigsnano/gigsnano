import type { EPlanTier, EBillingInterval } from "@/constants/plans";

export enum ESubscriptionStatus {
  Active = "active",
  PastDue = "past_due",
  Canceled = "canceled",
}

export interface ISubscription {
  tier: EPlanTier;
  interval: EBillingInterval;
  status: ESubscriptionStatus;
  /** Members occupying a paid seat. */
  seats_used: number;
  /** ISO date the current period renews/ends; null on Free. */
  current_period_end: string | null;
}
