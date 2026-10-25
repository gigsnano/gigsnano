import { describe, expect, it } from "vitest";

import { EPrivilege, EAuditAction } from "@/types/admin/admin";

describe("EPrivilege", () => {
  it("has the 15 spec keys", () => {
    expect(Object.values(EPrivilege).sort()).toEqual(
      [
        "audit.read", "billing.manage", "dashboard.read", "marketplace.moderate",
        "notifications.manage", "notifications.read", "roles.manage", "roles.read",
        "staff.manage", "usage.read", "users.manage", "users.read", "users.suspend",
        "workspaces.delete", "workspaces.read",
      ],
    );
  });
});

describe("EAuditAction", () => {
  it("includes user suspension audit actions", () => {
    expect(EAuditAction.UserSuspend).toBe("user.suspend");
    expect(EAuditAction.UserUnsuspend).toBe("user.unsuspend");
    expect(EAuditAction.UserUpdate).toBe("user.update");
  });
});
