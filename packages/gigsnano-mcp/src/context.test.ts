import { describe, expect, it, vi } from "vitest";
import { resolveContext } from "./context.js";

const ctx = { workspace_slug: "acme", project_id: "p1", identifier: "WEB" };

describe("resolveContext", () => {
  it("resolves from git remote", async () => {
    const client = { projectByRepo: vi.fn(async () => ctx) } as any;
    const out = await resolveContext(client, { repoFullName: "acme/web" });
    expect(out).toEqual(ctx);
    expect(client.projectByRepo).toHaveBeenCalledWith("acme/web");
  });
  it("throws a helpful error when nothing resolves", async () => {
    const client = { projectByRepo: vi.fn() } as any;
    await expect(resolveContext(client, { repoFullName: null }))
      .rejects.toThrow(/git remote|\.gigsnano\.json|project/i);
  });
});
