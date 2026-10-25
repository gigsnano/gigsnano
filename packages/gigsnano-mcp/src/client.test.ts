import { afterEach, describe, expect, it, vi } from "vitest";
import { GigsnanoClient, ApiError } from "./client.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}
afterEach(() => vi.restoreAllMocks());

describe("GigsnanoClient", () => {
  it("sends Bearer auth and parses JSON", async () => {
    const f = mockFetch(200, { workspace_slug: "acme", project_id: "p1", identifier: "WEB" });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "gnp_abc" });
    const r = await c.projectByRepo("acme/web");
    expect(r.identifier).toBe("WEB");
    const [, init] = f.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer gnp_abc" });
  });

  it("throws ApiError on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { detail: "nope" }));
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    await expect(c.resolveStory("acme", "WEB-9")).rejects.toBeInstanceOf(ApiError);
  });

  it("listStories uses the project-scoped path (not the workspace-wide one)", async () => {
    const f = mockFetch(200, { items: [{ id: "s1", code: "G-1", title: "T", status: "todo" }], total: 1 });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const out = await c.listStories("demo1", "p1", { status: "todo" });
    expect(out.items[0].code).toBe("G-1");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/demo1/projects/p1/stories/?status=todo");
  });

  it("listStories keeps the server's total and forwards paging", async () => {
    // The whole point: the API pages at 50, so a caller must be able to see that
    // 50 of 177 came back.
    const f = mockFetch(200, { items: [{ id: "s1", code: "G-1", title: "T", status: "todo" }], total: 177 });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const out = await c.listStories("demo1", "p1", { q: "login", limit: 200, offset: 50 });
    expect(out.total).toBe(177);
    expect(f.mock.calls[0][0]).toBe(
      "http://x/api/workspaces/demo1/projects/p1/stories/?q=login&limit=200&offset=50",
    );
  });

  it("bulkResolveStories fans out, dedupes, and reports bad codes per code", async () => {
    const f = vi.fn(async (url: string) =>
      url.includes("G-9")
        ? new Response(JSON.stringify({ detail: "Story not found" }), { status: 404 })
        : new Response(JSON.stringify({ id: "s1", code: "G-1", title: "T", status: "todo" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const out = await c.bulkResolveStories("demo1", ["G-1", "G-1", "G-9"]);

    expect(f).toHaveBeenCalledTimes(2); // deduped: G-1 fetched once
    // One bad code must not discard the good one.
    expect(out.items.map((s) => s.code)).toEqual(["G-1"]);
    expect(out.errors).toEqual([{ code: "G-9", error: "Story not found" }]);
  });

  it("subStories hits the sub-stories path", async () => {
    const f = mockFetch(200, [{ id: "s2", code: "G-2", title: "Child", status: "todo" }]);
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const out = await c.subStories("demo1", "p1", "s1");
    expect(out[0].code).toBe("G-2");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/demo1/projects/p1/stories/s1/sub-stories/");
  });

  it("createStory posts to the project stories path", async () => {
    const f = mockFetch(201, { id: "s9", code: "WEB-9", title: "New", status: "todo" });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const s = await c.createStory("acme", "p1", { title: "New" });
    expect(s.code).toBe("WEB-9");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/acme/projects/p1/stories/");
    expect((f.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("listComments hits the story comments path", async () => {
    const f = mockFetch(200, [{ id: "c1", body: "hi", author_name: "Demo", created_at: "2026-01-01" }]);
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const out = await c.listComments("acme", "p1", "s1");
    expect(out[0].body).toBe("hi");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/acme/projects/p1/stories/s1/comments/");
  });

  it("uploadStoryDocument posts to the story documents path", async () => {
    const f = mockFetch(201, { id: "d1", title: "Spec", content: "…", file_name: "spec.pdf", mime_type: "application/pdf" });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const d = await c.uploadStoryDocument("acme", "p1", "s1", { title: "Spec", file_name: "spec.pdf", mime_type: "application/pdf", content: "…" });
    expect(d.file_name).toBe("spec.pdf");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/acme/projects/p1/stories/s1/documents/");
  });

  it("listProjects hits the workspace projects path", async () => {
    const f = mockFetch(200, [{ id: "p1", name: "Web", identifier: "WEB" }]);
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const out = await c.listProjects("acme");
    expect(out[0].identifier).toBe("WEB");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/acme/projects/");
  });

  it("createLabel posts name+color to the labels path", async () => {
    const f = mockFetch(201, { id: "l1", name: "bug", color: "#f00" });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const l = await c.createLabel("acme", "p1", { name: "bug", color: "#f00" });
    expect(l.name).toBe("bug");
    expect(f.mock.calls[0][0]).toBe("http://x/api/workspaces/acme/projects/p1/labels/");
    expect((f.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("getUser hits the users directory path", async () => {
    const f = mockFetch(200, { id: "u1", display_name: "Demo", email: "d@d.com", avatar_url: null });
    vi.stubGlobal("fetch", f);
    const c = new GigsnanoClient({ baseUrl: "http://x/api", token: "t" });
    const u = await c.getUser("u1");
    expect(u.display_name).toBe("Demo");
    expect(f.mock.calls[0][0]).toBe("http://x/api/users/u1/");
  });
});
