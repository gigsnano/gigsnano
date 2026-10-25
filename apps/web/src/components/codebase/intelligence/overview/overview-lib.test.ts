import { describe, expect, it } from "vitest";

import { fmt, relativeTime, toViewId } from "./overview-lib";

describe("overview-lib", () => {
  it("fmt distinguishes not-measured from zero", () => {
    expect(fmt(null)).toBe("—"); // "not measured" — never shown as 0
    expect(fmt(0)).toBe("0");
    expect(fmt(1234)).toBe((1234).toLocaleString());
  });

  it("toViewId maps known drilldowns and rejects unknown", () => {
    expect(toViewId("issues")).toBe("issues");
    expect(toViewId("dependencies")).toBe("dependencies");
    expect(toViewId("nonsense")).toBeNull();
    expect(toViewId(null)).toBeNull();
  });

  it("relativeTime bands recent timestamps and dashes on missing/invalid", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime("not-a-date")).toBe("—");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoHoursAgo)).toBe("2h ago");
    const justNow = new Date(Date.now() - 5 * 1000).toISOString();
    expect(relativeTime(justNow)).toBe("just now");
  });
});
