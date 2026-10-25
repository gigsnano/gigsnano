import { describe, expect, it, vi } from "vitest";

import { contentService } from "./content.service";

describe("contentService", () => {
  it("posts JSON and returns markdown + lossy", async () => {
    const post = vi.spyOn(contentService as never as { post: unknown }, "post" as never)
      .mockResolvedValue({ markdown: "# x", lossy: ["mermaid"] } as never);
    const out = await contentService.toMarkdown({ type: "doc" });
    expect(out).toEqual({ markdown: "# x", lossy: ["mermaid"] });
    expect(post).toHaveBeenCalledWith("/content/to-markdown", { json: { type: "doc" } });
  });

  it("posts markdown and returns json + errors", async () => {
    vi.spyOn(contentService as never as { post: unknown }, "post" as never)
      .mockResolvedValue({ json: { type: "doc" }, errors: [] } as never);
    const out = await contentService.fromMarkdown("## hi");
    expect(out.errors).toEqual([]);
    expect(out.json).toEqual({ type: "doc" });
  });
});
