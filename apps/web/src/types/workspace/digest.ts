import type { EStoryStatus } from "@/types/story/story";

/** Role-based digest layout (GIN-102) — reshapes the same buckets by persona. */
export enum EDigestTemplate {
  Default = "default",
  Manager = "manager",
  Developer = "developer",
  Pm = "pm",
}

/** Delivery channels. "slack" is stored by the backend but not yet wired. */
export type TDigestChannel = "email" | "in_app" | "slack";

export interface IDigestPreference {
  enabled: boolean;
  /** IANA zone the delivery hour is expressed in, e.g. "Europe/Berlin" (GIN-124). */
  timezone: string;
  /** 0-23, local to `timezone`. */
  digest_hour: number;
  /**
   * Days the digest runs, 0 = Monday … 6 = Sun (Python's weekday()). The single
   * source of truth for "which days" — daily is all seven, weekly is one. It
   * replaced a frequency/weekly_day pair that stored the same fact twice.
   */
  digest_weekdays: number[];
  template: EDigestTemplate;
  statuses: EStoryStatus[];
  channels: TDigestChannel[];
}

export type IDigestPreferenceUpdate = Partial<IDigestPreference>;
