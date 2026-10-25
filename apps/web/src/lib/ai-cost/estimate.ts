import { EAiOperation, type ICostEstimate } from "@/types/billing/ai-cost";
import { AI_OPERATION_BASIS, AI_OPERATION_COSTS } from "./pricing";

/** Pure client-side estimate. Replaced by a live endpoint later; same return shape. */
export function estimateCost(operation: EAiOperation): ICostEstimate {
  const cost = AI_OPERATION_COSTS[operation];
  return {
    low_cents: cost.low_cents,
    typical_cents: cost.typical_cents,
    high_cents: cost.high_cents,
    basis: AI_OPERATION_BASIS[operation],
  };
}
