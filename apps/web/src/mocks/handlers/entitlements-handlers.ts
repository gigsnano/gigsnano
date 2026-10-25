import { computeSummary } from "@/lib/billing/entitlement-summary";

import { getMockSubscription } from "../data/subscription";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

// Deterministic month-to-date usage for the metered keys so the meters + the
// near-limit state are visible in the demo. ponytail: static, not a live counter.
const MOCK_USED: Record<string, number> = { agent_runs: 16, automations: 42 };

/** Entitlement summary (GIN-236). Tier follows the same mock subscription used
 * across billing (default Business; flip to Free via localStorage `gn_mock_plan`
 * to see locked states + the Free agent-runs meter near its 20/mo cap). */
export function makeEntitlementsHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/entitlements\/$/,
      resolve: ([, slug]) => computeSummary(getMockSubscription(slug).tier, MOCK_USED),
    },
  ];
}
