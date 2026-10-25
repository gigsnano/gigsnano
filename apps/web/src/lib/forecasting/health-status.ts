/**
 * Forecast-vs-target project health (GIN-338, first cut).
 *
 * Derives an honest status by comparing the Monte-Carlo forecast (GIN-334) against
 * the project's target date — nothing here invents certainty. The full health
 * engine (blockers, dependencies, scope/capacity signals, PM-reported status) is
 * GIN-328; until it lands this is explicitly "forecast vs target", surfaced with
 * its confidence so the reader knows how much to trust it.
 *
 * Pure + framework-free so the thresholds are unit-testable.
 */

export type THealthStatus =
  | "on_track" // P85 forecast lands on/before target — 85%+ likely to hit it
  | "at_risk" // target sits between P50 and P85 — could go either way
  | "off_track" // target is before even P50 — more likely to miss than hit
  | "no_target" // forecastable, but the project has no target date to judge against
  | "no_data"; // not enough history to forecast

export interface IHealthInput {
  forecastable: boolean;
  p50_date: string | null;
  p85_date: string | null;
  /** Project target date (`YYYY-MM-DD` or ISO), or null when none is set. */
  targetDate: string | null;
}

export function deriveHealthStatus(input: IHealthInput): THealthStatus {
  if (!input.forecastable || !input.p50_date || !input.p85_date) return "no_data";
  if (!input.targetDate) return "no_target";

  const target = Date.parse(input.targetDate);
  const p50 = Date.parse(input.p50_date);
  const p85 = Date.parse(input.p85_date);
  if (Number.isNaN(target) || Number.isNaN(p50) || Number.isNaN(p85)) return "no_data";

  if (p85 <= target) return "on_track";
  if (p50 <= target) return "at_risk";
  return "off_track";
}

/** Backend health status → local meta key. `no_data` carrying a `no_target`
 *  reason reads as "No target" so the user knows to set one; anything
 *  unrecognised falls back to `no_data`. Shared by the Project Health card and
 *  the Manager-360 roll-up so the status is derived in exactly one place. */
export function resolveHealthStatus(
  health: { status: string; reasons: { code: string }[] } | undefined | null,
): THealthStatus {
  if (!health) return "no_data";
  if (health.status === "no_data" && health.reasons.some((r) => r.code === "no_target")) {
    return "no_target";
  }
  const known: THealthStatus[] = ["on_track", "at_risk", "off_track", "no_data"];
  return (known as string[]).includes(health.status) ? (health.status as THealthStatus) : "no_data";
}

/**
 * Text-first status meta — every colour is paired with a `label` and `meaning`
 * so the signal never depends on colour alone (accessibility AC). `tone` maps to
 * design-token classes, not hard-coded hex.
 */
export const HEALTH_STATUS_META: Record<
  THealthStatus,
  { label: string; meaning: string; tone: "positive" | "caution" | "critical" | "neutral" }
> = {
  on_track: {
    label: "On track",
    meaning: "The 85% forecast completes on or before the target date.",
    tone: "positive",
  },
  at_risk: {
    label: "At risk",
    meaning: "The target falls between the 50% and 85% forecast — it may slip.",
    tone: "caution",
  },
  off_track: {
    label: "Off track",
    meaning: "The target is earlier than the 50% forecast — likely to be missed.",
    tone: "critical",
  },
  no_target: {
    label: "No target",
    meaning: "Set a target date to see whether delivery is on track.",
    tone: "neutral",
  },
  no_data: {
    label: "No data",
    meaning: "Not enough completed work yet to forecast a completion date.",
    tone: "neutral",
  },
};

export const CONFIDENCE_META: Record<
  string,
  { label: string; tone: "positive" | "caution" | "critical" | "neutral" }
> = {
  high: { label: "High confidence", tone: "positive" },
  medium: { label: "Medium confidence", tone: "caution" },
  low: { label: "Low confidence", tone: "critical" },
  no_data: { label: "No data", tone: "neutral" },
};

/** Human labels for the machine reason codes from the confidence engine (GIN-335). */
export const CONFIDENCE_REASON_LABELS: Record<string, string> = {
  no_completions: "No completed work yet",
  insufficient_completions: "Too few completed items",
  limited_history: "Limited delivery history",
  high_volatility: "Throughput varies a lot week to week",
  unstable_scope: "Scope has been changing recently",
  approximate_history: "History is partly inferred, not recorded",
  sparse_history: "Few periods have delivered work",
};
