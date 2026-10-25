import { describe, it, expect } from "vitest";

import { gigsqlViewError, isValidGigsqlView, canonicalGigsqlView } from "./validate-gigsql";

describe("gigsqlViewError — saved-view GigsQL validation (GIN-311)", () => {
  it("accepts the ticket's valid queries", () => {
    expect(gigsqlViewError("")).toBeNull(); // empty = show everything
    expect(gigsqlViewError("status:todo")).toBeNull();
    expect(gigsqlViewError("status:todo status:in_progress")).toBeNull();
    expect(gigsqlViewError("status in (todo, in_progress)")).toBeNull();
    expect(gigsqlViewError("priority:high assignee:me")).toBeNull();
  });

  it("rejects the ticket's invalid queries with a reason", () => {
    for (const bad of [
      "status in ()",
      "status in (unknown_status)",
      "unknown_field:value",
      "status in (todo,", // unclosed parenthesis
      "status in (todo,)", // trailing comma
      "status:", // missing value
    ]) {
      expect(gigsqlViewError(bad), bad).toBeTruthy();
    }
  });

  it("rejects code-analysis fields — they can't scope a work-item view", () => {
    expect(gigsqlViewError("severity:high")).toBeTruthy();
  });

  it("isValidGigsqlView is the boolean of no error", () => {
    expect(isValidGigsqlView("status in (todo, in_progress)")).toBe(true);
    expect(isValidGigsqlView("status in ()")).toBe(false);
  });
});

describe("canonicalGigsqlView — stable stored representation", () => {
  it("normalizes both multi-value forms to the same canonical `in (...)`", () => {
    const a = canonicalGigsqlView("status:todo status:in_progress");
    const b = canonicalGigsqlView("status in (todo, in_progress)");
    expect(a).toBe(b);
    expect(a).toContain("in (todo, in_progress)");
  });

  it("treats field names case-insensitively (values still match the enum)", () => {
    expect(gigsqlViewError("STATUS in (todo, in_progress)")).toBeNull();
  });

  it("round-trips: canonical output re-validates and re-normalizes to itself", () => {
    const canon = canonicalGigsqlView("status in (todo, in_progress)");
    expect(gigsqlViewError(canon)).toBeNull();
    expect(canonicalGigsqlView(canon)).toBe(canon);
  });
});
