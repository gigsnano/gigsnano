import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import type { IInitiative, IRelease, IRoadmapRollup } from "@/types";

describe("roadmap mock handlers", () => {
  it("lists initiatives and computes a slip rollup", async () => {
    const list = await resolveMock<IInitiative[]>("GET", "/workspaces/acme/initiatives/");
    expect(list.length).toBeGreaterThan(0);
    const rollup = await resolveMock<IRoadmapRollup>(
      "GET",
      "/workspaces/acme/initiatives/init_pay/rollup/",
    );
    expect(rollup.total).toBeGreaterThan(0);
    expect(["on_track", "at_risk", "off_track"]).toContain(rollup.slip_signal);
  });

  it("creates + patches an initiative", async () => {
    const created = await resolveMock<IInitiative>("POST", "/workspaces/acme/initiatives/", {
      title: "New theme",
    });
    expect(created.id).toBeTruthy();
    const patched = await resolveMock<IInitiative>(
      "PATCH",
      `/workspaces/acme/initiatives/${created.id}/`,
      { status: "in_progress" },
    );
    expect(patched.status).toBe("in_progress");
  });

  it("generates a changelog from the seeded linked items", async () => {
    const rel = await resolveMock<IRelease>(
      "POST",
      "/workspaces/acme/projects/prj_mba/releases/rel_21/changelog/",
      {},
    );
    expect(rel.changelog_md).toContain("v2.1");
    expect(rel.changelog_md).toContain("Added");
  });

  it("publish sets released status + timestamp", async () => {
    const rel = await resolveMock<IRelease>(
      "PATCH",
      "/workspaces/acme/projects/prj_mba/releases/rel_21/",
      { status: "released" },
    );
    expect(rel.status).toBe("released");
    expect(rel.released_at).toBeTruthy();
  });
});
