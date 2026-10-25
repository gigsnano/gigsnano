import { describe, expect, it } from "vitest";

import { buildHeadline } from "./headline";

const p = (health: "on_track" | "at_risk" | "off_track" | "no_data") => ({ health });

describe("buildHeadline", () => {
  it("states projects, risk and what needs you", () => {
    expect(
      buildHeadline({
        projects: [p("on_track"), p("at_risk"), p("on_track"), p("no_data"), p("on_track"), p("on_track")],
        needsYou: 3,
      }),
    ).toEqual([
      { text: "6 projects moving.", tone: "default" },
      { text: "1 at risk.", tone: "warning" },
      { text: "3 need you.", tone: "primary" },
    ]);
  });

  it("counts off-track as at risk and handles singulars", () => {
    expect(buildHeadline({ projects: [p("off_track")], needsYou: 1 })).toEqual([
      { text: "1 project moving.", tone: "default" },
      { text: "1 at risk.", tone: "warning" },
      { text: "1 needs you.", tone: "primary" },
    ]);
  });

  it("omits the risk clause and says nothing needs you when all is clear", () => {
    expect(buildHeadline({ projects: [p("on_track"), p("on_track")], needsYou: 0 })).toEqual([
      { text: "2 projects moving.", tone: "default" },
      { text: "Nothing needs you.", tone: "default" },
    ]);
  });

  it("handles a workspace with no projects", () => {
    expect(buildHeadline({ projects: [], needsYou: 0 })).toEqual([
      { text: "No projects yet.", tone: "default" },
    ]);
  });
});
