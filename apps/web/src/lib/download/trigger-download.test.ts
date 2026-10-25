import { describe, expect, it } from "vitest";
import { apiUrl } from "./trigger-download";

describe("apiUrl", () => {
  it("prefixes the API base", () => {
    expect(apiUrl("/workspaces/acme/exports/1/download/")).toContain(
      "/workspaces/acme/exports/1/download/",
    );
  });
});
