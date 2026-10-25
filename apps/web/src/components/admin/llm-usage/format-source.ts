import {
  formatAiOperation,
  formatAiSource,
  formatTokenCount as formatTokenCountShared,
} from "@/lib/ai-cost/format";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

// Labels + token formatting moved to lib/ai-cost/format so user-facing receipts
// can share them (billing must not import from admin). Re-exported under the
// original names to keep this module's callers unchanged.
export const formatLlmUsageSource = formatAiSource;
export const formatLlmUsageOperation = formatAiOperation;
export const formatTokenCount = formatTokenCountShared;

export function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return usdFormatter.format(value);
}
