import { describe, expect, it } from "vitest";

import { projectRouteManagesOwnScroll } from "./project-scroll-routes";

const P = "/acme/projects/9f18ddde-24ec-4aa2-ab79-a3e25d1ba88c";

describe("projectRouteManagesOwnScroll", () => {
  it("bounds the app-shell routes", () => {
    expect(projectRouteManagesOwnScroll(`${P}/issues`)).toBe(true);
    expect(projectRouteManagesOwnScroll(`${P}/issues/story-1`)).toBe(true);
    expect(projectRouteManagesOwnScroll(`${P}/codebase`)).toBe(true);
    expect(projectRouteManagesOwnScroll(`${P}/journey/step-1`)).toBe(true);
    expect(projectRouteManagesOwnScroll(`${P}/meetings/meeting-1`)).toBe(true);
  });

  it("leaves document routes on the page scroll", () => {
    expect(projectRouteManagesOwnScroll(`${P}`)).toBe(false);
    expect(projectRouteManagesOwnScroll(`${P}/journey`)).toBe(false);
    expect(projectRouteManagesOwnScroll(`${P}/cycles`)).toBe(false);
    expect(projectRouteManagesOwnScroll(`${P}/codebase/bundles`)).toBe(false);
    expect(projectRouteManagesOwnScroll(`${P}/issues/story-1/assistant`)).toBe(false);
    expect(projectRouteManagesOwnScroll(`${P}/meetings`)).toBe(false);
  });

  it("excludes /journey/discovery — it is a document, not the step workspace", () => {
    expect(projectRouteManagesOwnScroll(`${P}/journey/discovery`)).toBe(false);
    // …but a step's own sub-surfaces are separate pages too.
    expect(projectRouteManagesOwnScroll(`${P}/journey/step-1/studio`)).toBe(false);
  });
});
