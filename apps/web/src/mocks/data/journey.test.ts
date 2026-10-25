import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import { shouldUseMock } from "@/services/mock-fallback";
import type { IJourney } from "@/types";

describe("journey mock seam", () => {
  const path = "/workspaces/acme/projects/prj_x/journey/";

  it("hits the real API when mocks are off (GIN-434 Phase 0 cutover)", () => {
    // The journey endpoint is live on gigsnano-api — no MOCK_ONLY_RULE.
    expect(shouldUseMock("GET", path)).toBe(false);
  });

  it("still resolves via the mock layer for full-mock mode", async () => {
    const j = await resolveMock<IJourney>("GET", path);
    expect(j.project_id).toBe("prj_x");
    expect(j.steps.length).toBeGreaterThan(0);
    expect(j.steps.some((s) => s.state === "verified")).toBe(true);
  });
});
