import { describe, expect, it } from "vitest";

import { canonicalTabParam, parseWorkItemTab, WORK_ITEM_TABS } from "./work-item-tabs";

describe("parseWorkItemTab", () => {
  it("resolves every real tab id", () => {
    for (const tab of WORK_ITEM_TABS) {
      expect(parseWorkItemTab(tab.id)).toBe(tab.id);
    }
  });

  it("falls back to overview for absent or unknown values", () => {
    expect(parseWorkItemTab(null)).toBe("overview");
    expect(parseWorkItemTab(undefined)).toBe("overview");
    expect(parseWorkItemTab("")).toBe("overview");
    expect(parseWorkItemTab("nope")).toBe("overview");
  });

  it("aliases the retired ?tab=execute to runs", () => {
    expect(parseWorkItemTab("execute")).toBe("runs");
    expect(parseWorkItemTab("Execute")).toBe("runs");
  });
});

describe("canonicalTabParam", () => {
  it("rewrites only aliases", () => {
    expect(canonicalTabParam("execute")).toBe("runs");
    expect(canonicalTabParam("EXECUTE")).toBe("runs");
  });

  it("leaves canonical, absent and unknown values alone", () => {
    expect(canonicalTabParam("runs")).toBeNull();
    expect(canonicalTabParam("overview")).toBeNull();
    expect(canonicalTabParam(null)).toBeNull();
    // A typo must not rewrite the address bar — it just renders Overview.
    expect(canonicalTabParam("delivry")).toBeNull();
  });
});
