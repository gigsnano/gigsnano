import { describe, expect, it } from "vitest";

import { formatAction } from "./format-action";

describe("formatAction", () => {
  it("humanizes dotted action keys", () => {
    expect(formatAction("role.update")).toBe("Role · update");
    expect(formatAction("admin.access")).toBe("Admin · access");
    expect(formatAction("staff.grant")).toBe("Staff · grant");
    expect(formatAction("user.suspend")).toBe("User · suspend");
    expect(formatAction("user.update")).toBe("User · update");
  });
});
