import { describe, expect, it } from "vitest";

import { ADMIN_NAV } from "./admin-nav";

describe("ADMIN_NAV", () => {
  it("lists the nine modules with hrefs + gating privileges", () => {
    expect(ADMIN_NAV.map((n) => n.href)).toEqual([
      "/admin",
      "/admin/llm-usage",
      "/admin/users",
      "/admin/workspaces",
      "/admin/marketplace",
      "/admin/roles",
      "/admin/notification-templates",
      "/admin/billing",
      "/admin/audit",
    ]);
    for (const n of ADMIN_NAV) expect(n.privilege).toBeTruthy();
  });
});
