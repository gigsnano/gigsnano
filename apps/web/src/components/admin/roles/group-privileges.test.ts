import { describe, expect, it } from "vitest";

import { groupPrivileges } from "./group-privileges";

describe("groupPrivileges", () => {
  it("groups privileges by their group, preserving first-seen order", () => {
    const grouped = groupPrivileges([
      { key: "users.read", group: "Users", label: "View users" },
      { key: "audit.read", group: "Audit", label: "View audit" },
      { key: "users.suspend", group: "Users", label: "Suspend users" },
    ]);
    expect(grouped).toEqual([
      { group: "Users", items: [
        { key: "users.read", group: "Users", label: "View users" },
        { key: "users.suspend", group: "Users", label: "Suspend users" },
      ] },
      { group: "Audit", items: [
        { key: "audit.read", group: "Audit", label: "View audit" },
      ] },
    ]);
  });
});
