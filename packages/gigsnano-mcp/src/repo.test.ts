import { describe, expect, it } from "vitest";
import { normalizeRemote } from "./repo.js";

describe("normalizeRemote", () => {
  it("parses ssh remotes", () => {
    expect(normalizeRemote("git@github.com:Acme/Web.git")).toBe("acme/web");
  });
  it("parses https remotes", () => {
    expect(normalizeRemote("https://github.com/Acme/Web.git")).toBe("acme/web");
  });
  it("parses https without .git", () => {
    expect(normalizeRemote("https://github.com/acme/web")).toBe("acme/web");
  });
  it("returns null for non-github", () => {
    expect(normalizeRemote("https://gitlab.com/a/b.git")).toBeNull();
  });
});
