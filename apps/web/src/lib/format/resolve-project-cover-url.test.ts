import { describe, expect, it } from "vitest";

import { DEFAULT_PROJECT_COVER } from "@/constants/project-gallery";
import { resolveProjectCoverUrl } from "./resolve-project-cover-url";

describe("resolveProjectCoverUrl", () => {
  it("passes through allowlisted Unsplash URLs", () => {
    const url =
      "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=1200&q=80&auto=format&fit=crop";
    expect(resolveProjectCoverUrl(url)).toBe(url);
  });

  it("falls back for unconfigured hosts", () => {
    expect(resolveProjectCoverUrl("https://x/y.jpg")).toBe(DEFAULT_PROJECT_COVER.url);
  });

  it("falls back for invalid URLs", () => {
    expect(resolveProjectCoverUrl("not-a-url")).toBe(DEFAULT_PROJECT_COVER.url);
    expect(resolveProjectCoverUrl(null)).toBe(DEFAULT_PROJECT_COVER.url);
  });
});
