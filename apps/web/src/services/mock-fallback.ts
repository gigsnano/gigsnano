type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Owns the mock decision. Mocks are ON by default in development and OFF in
 * production; set NEXT_PUBLIC_USE_MOCKS="true"|"false" to force either way.
 * The value is inlined at build time, so a production build never serves mocks
 * even if the flag is forgotten (the NODE_ENV fallback guards against that).
 */
const USE_MOCKS =
  process.env.NEXT_PUBLIC_USE_MOCKS === "true"
    ? true
    : process.env.NEXT_PUBLIC_USE_MOCKS === "false"
      ? false
      : process.env.NODE_ENV !== "production";

/**
 * Path patterns for domains that have NO real backend endpoint yet. When mocks
 * are globally OFF (cutover), these still resolve via the mock layer so their
 * screens keep working. Remove a rule the moment its backend domain ships.
 */
// GIN-443/GIN-446: solutions registry + setup-drafts are live on gigsnano-api.
// analysis-jobs and setup-connections still have no backend — remove when shipped.
export const MOCK_SEGMENTS: string[] = [
  "analysis-jobs",
  "setup-connections",
];
// Matches `/segment/` or `/segment/{id}/` as a whole path component (leading slash
// required, so `workspace-views` never matches the `views` alternative). Null when
// there are no segments — an empty alternation would otherwise match every path.
const MOCK_SEGMENT_RE =
  MOCK_SEGMENTS.length > 0 ? new RegExp(`/(${MOCK_SEGMENTS.join("|")})(/|$)`) : null;

type MockRule = { method?: Method; match: (path: string) => boolean };

const MOCK_ONLY_RULES: MockRule[] = [
  { match: (p) => MOCK_SEGMENT_RE !== null && MOCK_SEGMENT_RE.test(p) },
  // AI cost estimate is client-side only (no backend endpoint) — keep it mocked.
  // Workspace ai-usage summary + thread usage are now live on gigsnano-api.
  { method: "POST", match: (p) => /\/ai-usage\/estimate\/$/.test(p) },
  // GIN-408 multi-repo repositories + System Bundles are live on gigsnano-api
  // (GIN-409/410/412) — no mock-only rule; prod hits the real API.
  // Project Journey (GIN-434 Phase 0) is live on gigsnano-api — GET /journey/
  // projects Sprint-0 state; no mock-only rule.
];

/** True → serve from the mock layer; false → hit the real API. */
export function shouldUseMock(method: Method, path: string): boolean {
  if (USE_MOCKS) return true; // global dev default: everything mock
  const bare = path.split("?")[0];
  return MOCK_ONLY_RULES.some((r) => (!r.method || r.method === method) && r.match(bare));
}
