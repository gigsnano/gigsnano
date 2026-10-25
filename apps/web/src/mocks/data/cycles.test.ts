import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";

describe("cycle delete mock", () => {
  it("removes the cycle and clears its stories' cycle_id", async () => {
    const slug = "acme";
    const projectId = "prj_mba";
    const cycleId = "cyc_mba_s1"; // Sprint 1 has seeded stories in mocks

    const before = await resolveMock<unknown[]>(
      "GET",
      `/workspaces/${slug}/projects/${projectId}/cycles/`,
    );
    const countBefore = before.length;

    const res = await resolveMock<{ success: boolean }>(
      "DELETE",
      `/workspaces/${slug}/projects/${projectId}/cycles/${cycleId}/`,
    );
    expect(res).toEqual({ success: true });

    const after = await resolveMock<{ id: string }[]>(
      "GET",
      `/workspaces/${slug}/projects/${projectId}/cycles/`,
    );
    expect(after.length).toBe(countBefore - 1);
    expect(after.find((c) => c.id === cycleId)).toBeUndefined();
  });
});
