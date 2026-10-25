import { describe, expect, it } from "vitest";
import { EStoryActivityField } from "@/types";
import { restorePatch } from "./restore-field";

describe("restorePatch", () => {
  it("restores description html verbatim", () => {
    expect(restorePatch(EStoryActivityField.Description, "<p>old</p>")).toEqual({
      description: "<p>old</p>",
    });
  });
  it("maps status/priority to their enum keys", () => {
    expect(restorePatch(EStoryActivityField.Status, "backlog")).toEqual({ status: "backlog" });
    expect(restorePatch(EStoryActivityField.Priority, "high")).toEqual({ priority: "high" });
  });
  it("maps assignee/parent to *_id keys", () => {
    expect(restorePatch(EStoryActivityField.Assignee, "u1")).toEqual({ assignee_id: "u1" });
    expect(restorePatch(EStoryActivityField.Parent, "s1")).toEqual({ parent_id: "s1" });
  });
  it("returns null for non-restorable fields", () => {
    expect(restorePatch(EStoryActivityField.Created, "x")).toBeNull();
    expect(restorePatch(EStoryActivityField.Link, "x")).toBeNull();
    // Labels are a set whose history stores NAMES, not ids (GIN-475) — there is
    // nothing unambiguous to restore in one click.
    expect(restorePatch(EStoryActivityField.Label, "bug, urgent")).toBeNull();
  });
});
