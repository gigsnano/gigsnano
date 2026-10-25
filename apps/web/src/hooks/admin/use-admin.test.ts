import { describe, expect, it } from "vitest";

import * as hooks from "./use-admin";

describe("use-admin exports", () => {
  it("exposes the admin hooks", () => {
    for (const name of [
      "useStaffMe",
      "usePrivileges",
      "useStaffRoles",
      "useStaffMembers",
      "useAuditLogs",
      "useCreateRole",
      "useUpdateRole",
      "useDeleteRole",
      "useGrantStaff",
      "useUpdateStaff",
      "useRevokeStaff",
      "useLlmUsageSummary",
      "useLlmUsageTimeseries",
      "useLlmUsageHeatmapDaily",
      "useLlmUsageHeatmapHourly",
      "useLlmUsageMatrix",
      "useLlmUsageByWorkspace",
      "useLlmUsageByUser",
      "useLlmUsageEvents",
    ]) {
      expect(typeof (hooks as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
