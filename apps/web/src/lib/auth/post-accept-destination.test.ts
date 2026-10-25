import { describe, expect, it } from "vitest";

import { postAcceptDestination } from "./post-accept-destination";

describe("postAcceptDestination", () => {
  it("waits while the project list is loading", () => {
    expect(postAcceptDestination("acme", undefined)).toBeNull();
  });

  it("goes straight to the one project waiting for them (GIN-529)", () => {
    expect(postAcceptDestination("acme", [{ id: "p1" }])).toBe("/acme/projects/p1");
  });

  it("falls back to the workspace when nothing is attached", () => {
    expect(postAcceptDestination("acme", [])).toBe("/acme");
  });

  it("falls back to the workspace when several projects are attached", () => {
    // With more than one there is no "the project" to mean — picking for them
    // would be a guess, and the workspace home lists all of them.
    expect(postAcceptDestination("acme", [{ id: "p1" }, { id: "p2" }])).toBe("/acme");
  });
});
