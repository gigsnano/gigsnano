import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import type { ITeamspace, ITeamspaceOverview } from "@/types";

describe("teamspace mock handlers", () => {
  it("lists seeded teamspaces for the workspace", async () => {
    const list = await resolveMock<ITeamspace[]>("GET", "/workspaces/acme/teamspaces/");
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].project_ids.length).toBeGreaterThan(0);
  });

  it("overview rolls up projects, workload and roster", async () => {
    const ov = await resolveMock<ITeamspaceOverview>(
      "GET",
      "/workspaces/acme/teamspaces/ts_pay/overview/",
    );
    expect(ov.projects.length).toBeGreaterThan(0);
    expect(ov.rollup.total).toBeGreaterThan(0);
    expect(ov.rollup.progress_pct).toBeGreaterThanOrEqual(0);
    expect(ov.agent_workload.length).toBeGreaterThan(0);
    expect(ov.pinned_roster.length).toBeGreaterThan(0);
  });

  it("create then set projects then overview reflects it", async () => {
    const created = await resolveMock<ITeamspace>("POST", "/workspaces/acme/teamspaces/", {
      name: "QA Guild",
      member_ids: ["u_2"],
    });
    expect(created.id).toBeTruthy();

    await resolveMock("PUT", `/workspaces/acme/teamspaces/${created.id}/projects/`, {
      ids: ["prj_mba"],
    });
    const ov = await resolveMock<ITeamspaceOverview>(
      "GET",
      `/workspaces/acme/teamspaces/${created.id}/overview/`,
    );
    expect(ov.projects.some((p) => p.id === "prj_mba")).toBe(true);
  });
});
