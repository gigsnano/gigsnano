import { describe, expect, it } from "vitest";

import type { IPagePresenceViewer } from "@/types";

import { editingAdvisory, otherViewers } from "./page-presence";

function viewer(overrides: Partial<IPagePresenceViewer>): IPagePresenceViewer {
  return {
    user_id: "u_1",
    display_name: "Ada",
    avatar_url: null,
    editing: false,
    last_seen: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

describe("otherViewers", () => {
  it("excludes yourself from the list", () => {
    const viewers = [viewer({ user_id: "me" }), viewer({ user_id: "u_2", display_name: "Alan" })];
    expect(otherViewers(viewers, "me").map((v) => v.user_id)).toEqual(["u_2"]);
  });

  it("keeps everyone when self id is unknown", () => {
    const viewers = [viewer({ user_id: "u_1" }), viewer({ user_id: "u_2" })];
    expect(otherViewers(viewers, undefined)).toHaveLength(2);
  });
});

describe("editingAdvisory", () => {
  it("returns null when nobody else is editing", () => {
    const viewers = [viewer({ user_id: "me", editing: true })];
    expect(editingAdvisory(viewers, "me")).toBeNull();
  });

  it("names the single other editor", () => {
    const viewers = [viewer({ user_id: "u_2", display_name: "Alan", editing: true })];
    expect(editingAdvisory(viewers, "me")).toBe("Alan is editing this page.");
  });

  it("names both editors when exactly two", () => {
    const viewers = [
      viewer({ user_id: "u_2", display_name: "Alan", editing: true }),
      viewer({ user_id: "u_3", display_name: "Grace", editing: true }),
    ];
    expect(editingAdvisory(viewers, "me")).toBe("Alan and Grace are editing this page.");
  });

  it("collapses to an overflow count for three or more editors", () => {
    const viewers = [
      viewer({ user_id: "u_2", display_name: "Alan", editing: true }),
      viewer({ user_id: "u_3", display_name: "Grace", editing: true }),
      viewer({ user_id: "u_4", display_name: "Bo", editing: true }),
    ];
    expect(editingAdvisory(viewers, "me")).toBe("Alan and 2 others are editing this page.");
  });

  it("ignores viewers who are only viewing, not editing", () => {
    const viewers = [viewer({ user_id: "u_2", display_name: "Alan", editing: false })];
    expect(editingAdvisory(viewers, "me")).toBeNull();
  });
});
