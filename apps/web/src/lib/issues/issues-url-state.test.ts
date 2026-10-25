import { describe, expect, it } from "vitest";

import { readGigsqlParam, writeGigsqlParam } from "./issues-url-state";

describe("issues URL gigsql param", () => {
  it("reads trimmed gigsql from search params", () => {
    const params = new URLSearchParams("gigsql=status+%3D+todo&peek=abc");
    expect(readGigsqlParam(params)).toBe("status = todo");
  });

  it("writes gigsql to search params and clears when empty", () => {
    const base = new URLSearchParams("peek=abc");
    const withQuery = writeGigsqlParam(base, "priority = high");
    expect(withQuery.get("gigsql")).toBe("priority = high");
    expect(withQuery.get("peek")).toBe("abc");

    const cleared = writeGigsqlParam(withQuery, "  ");
    expect(cleared.has("gigsql")).toBe(false);
    expect(cleared.get("peek")).toBe("abc");
  });

  it("round-trips a shareable filter link", () => {
    const query = "status in (todo, in_progress) AND priority = high";
    const params = writeGigsqlParam(new URLSearchParams(), query);
    expect(readGigsqlParam(params)).toBe(query);
  });
});
