import { describe, expect, it, vi } from "vitest";
import { buildTools } from "./tools.js";

const story = {
  id: "s1", code: "WEB-1", title: "Fix login", description: "d",
  status: "todo", priority: "high", project_id: "p1", workspace_slug: "acme",
};

function fakeClient(overrides = {}) {
  return {
    projectByRepo: vi.fn(async () => ({ workspace_slug: "acme", project_id: "p1", identifier: "WEB" })),
    resolveStory: vi.fn(async () => story),
    updateStory: vi.fn(async (_s, _p, _i, patch) => ({ ...story, ...patch })),
    addComment: vi.fn(async () => {}),
    myStories: vi.fn(async () => [story]),
    listStories: vi.fn(async () => ({ items: [story], total: 1 })),
    bulkResolveStories: vi.fn(async () => ({ items: [story], errors: [] })),
    subStories: vi.fn(async () => [{ ...story, id: "s2", code: "WEB-2", title: "Child" }]),
    searchStories: vi.fn(async () => ({ items: [story], total: 1 })),
    createStory: vi.fn(async (_s, _p, payload) => ({ ...story, ...payload, id: "s9", code: "WEB-9" })),
    listComments: vi.fn(async () => [{ id: "c1", body: "hi", author_name: "Demo", created_at: "x" }]),
    updateComment: vi.fn(async (_s, _p, _i, _c, body) => ({ id: "c1", body, author_name: "Demo", created_at: "x" })),
    deleteComment: vi.fn(async () => {}),
    listStoryDocuments: vi.fn(async () => [{ id: "d1", title: "Doc", content: "x", file_name: null, mime_type: null }]),
    getDocument: vi.fn(async () => ({ id: "d1", title: "Doc", content: "x", file_name: null, mime_type: null })),
    uploadStoryDocument: vi.fn(async () => ({ id: "d1", title: "Spec", content: "x", file_name: "spec.pdf", mime_type: "application/pdf" })),
    deleteDocument: vi.fn(async () => {}),
    listProjects: vi.fn(async () => [{ id: "p1", name: "Web", identifier: "WEB" }]),
    getProject: vi.fn(async () => ({ id: "p1", name: "Web", identifier: "WEB" })),
    listStates: vi.fn(async () => [{ id: "st1", name: "Todo", color: "#ccc" }]),
    listLabels: vi.fn(async () => [{ id: "l1", name: "bug", color: "#f00" }]),
    createLabel: vi.fn(async (_s, _p, payload) => ({ id: "l1", ...payload })),
    listCycles: vi.fn(async () => [{ id: "cy1", name: "Sprint 0", start_date: null, end_date: null }]),
    listModules: vi.fn(async () => [{ id: "m1", name: "Core" }]),
    listMembers: vi.fn(async () => [{ user_id: "u1", display_name: "Demo", email: "d@d.com", role: "admin", status: "active" }]),
    getUser: vi.fn(async () => ({ id: "u1", display_name: "Demo", email: "d@d.com", avatar_url: null })),
    ...overrides,
  } as any;
}

describe("list_my_work_items", () => {
  it("returns a trimmed list of my stories", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_my_work_items.handler({});
    expect(client.myStories).toHaveBeenCalledWith("acme");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([{ code: "WEB-1", title: "Fix login", status: "todo", priority: "high" }]);
  });
});

describe("get_work_item", () => {
  it("returns the full story", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.get_work_item.handler({ code: "WEB-1" });
    expect(client.resolveStory).toHaveBeenCalledWith("acme", "WEB-1");
    expect(JSON.parse(res.content[0].text)).toEqual(story);
  });
});

describe("start_work_item", () => {
  it("sets in_progress and comments", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.start_work_item.handler({ code: "WEB-1" });
    expect(client.updateStory).toHaveBeenCalledWith("acme", "p1", "s1", { status: "in_progress" });
    expect(client.addComment).toHaveBeenCalled();
    expect(res.content[0].text).toContain("in_progress");
  });
});

describe("add_comment", () => {
  it("posts a comment on the resolved story", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.add_comment.handler({ code: "WEB-1", body: "hello" });
    expect(client.addComment).toHaveBeenCalledWith("acme", "p1", "s1", "hello", expect.any(String));
    expect(JSON.parse(res.content[0].text)).toEqual({ ok: true });
  });
});

describe("complete_work_item", () => {
  it("sets in_review with PR link, never done", async () => {
    const client = fakeClient({ resolveStory: vi.fn(async () => ({ ...story, status: "in_progress" })) });
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.complete_work_item.handler({ code: "WEB-1", pr_url: "http://pr/1", summary: "done" });
    expect(client.updateStory).toHaveBeenCalledWith("acme", "p1", "s1", { status: "in_review" });
    const comment = client.addComment.mock.calls[0][3];
    expect(comment).toContain("http://pr/1");
    expect(comment).toContain("done");
  });

  it("falls back to a default note when no summary/pr_url given", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.complete_work_item.handler({ code: "WEB-1" });
    const comment = client.addComment.mock.calls[0][3];
    expect(comment).toBe("Completed via Claude Code.");
  });
});

describe("create_work_item", () => {
  it("creates a story in the active project", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.create_work_item.handler({ title: "New bug", type: "bug" });
    expect(client.createStory).toHaveBeenCalledWith("acme", "p1", expect.objectContaining({ title: "New bug", type: "bug" }));
    expect(res.content[0].text).toContain("WEB-9");
  });
  it("does not forward the project override into the create payload", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.create_work_item.handler({ title: "X", project: "demo/p9" });
    expect(client.createStory).toHaveBeenCalledWith("demo", "p9", { title: "X" });
  });
  it("resolves a `parent` code to parent_id and drops the raw `parent` (GIN-348)", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.create_work_item.handler({ title: "Child", parent: "WEB-1" });
    expect(client.resolveStory).toHaveBeenCalledWith("acme", "WEB-1");
    expect(client.createStory).toHaveBeenCalledWith("acme", "p1", { title: "Child", parent_id: "s1" });
  });
});

describe("update_work_item", () => {
  it("resolves the code then patches", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.update_work_item.handler({ code: "WEB-1", priority: "high" });
    expect(client.updateStory).toHaveBeenCalledWith("acme", "p1", "s1", { priority: "high" });
  });
  it("resolves a `parent` code to parent_id and drops the raw `parent` (GIN-348)", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.update_work_item.handler({ code: "WEB-2", parent: "WEB-1" });
    expect(client.updateStory).toHaveBeenCalledWith("acme", "p1", "s1", { parent_id: "s1" });
  });
});

describe("list_work_items", () => {
  it("lists and trims stories in the active project", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_work_items.handler({});
    expect(client.listStories).toHaveBeenCalledWith("acme", "p1", {
      status: undefined, assignee_id: undefined, q: undefined, limit: undefined, offset: undefined,
    });
    expect(res.content[0].text).toContain("WEB-1");
  });

  it("reports the total and flags a truncated page", async () => {
    // The API pages at 50. Returning a bare array of 50 out of 177 reads as
    // "that's the whole project" — which is how sub-issues got guessed wrong.
    const client = fakeClient({
      listStories: vi.fn(async () => ({ items: [story], total: 177 })),
    });
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const parsed = JSON.parse((await tools.list_work_items.handler({})).content[0].text);
    expect(parsed).toMatchObject({ total: 177, returned: 1, offset: 0, truncated: true });
  });

  it("is not truncated when the page covers the total", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const parsed = JSON.parse((await tools.list_work_items.handler({})).content[0].text);
    expect(parsed).toMatchObject({ total: 1, returned: 1, truncated: false });
  });

  it("accounts for offset when deciding truncation", async () => {
    const client = fakeClient({ listStories: vi.fn(async () => ({ items: [story], total: 2 })) });
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const parsed = JSON.parse((await tools.list_work_items.handler({ offset: 1 })).content[0].text);
    expect(parsed).toMatchObject({ offset: 1, truncated: false }); // 1 + 1 === 2
  });

  it("passes search and paging through", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.list_work_items.handler({ q: "login", limit: 100, offset: 50 });
    expect(client.listStories).toHaveBeenCalledWith("acme", "p1",
      expect.objectContaining({ q: "login", limit: 100, offset: 50 }));
  });
});

describe("fetch_work_items", () => {
  it("resolves many codes in one call", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.fetch_work_items.handler({ codes: ["WEB-1", "WEB-2"] });
    expect(client.bulkResolveStories).toHaveBeenCalledWith("acme", ["WEB-1", "WEB-2"]);
    expect(JSON.parse(res.content[0].text)).toEqual({ items: [story] });
  });

  it("omits errors when every code resolved", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.fetch_work_items.handler({ codes: ["WEB-1"] });
    expect(JSON.parse(res.content[0].text)).not.toHaveProperty("errors");
  });

  it("surfaces bad codes alongside the items that resolved", async () => {
    const client = fakeClient({
      bulkResolveStories: vi.fn(async () => ({
        items: [story], errors: [{ code: "WEB-9", error: "Story not found" }],
      })),
    });
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const parsed = JSON.parse((await tools.fetch_work_items.handler({ codes: ["WEB-1", "WEB-9"] })).content[0].text);
    expect(parsed.items).toEqual([story]);
    expect(parsed.errors).toEqual([{ code: "WEB-9", error: "Story not found" }]);
  });

  it("rejects an empty or oversized batch", () => {
    const tools = buildTools(fakeClient(), { repoFullName: "acme/web" });
    expect(tools.fetch_work_items.schema.safeParse({ codes: [] }).success).toBe(false);
    expect(
      tools.fetch_work_items.schema.safeParse({ codes: Array(51).fill("WEB-1") }).success,
    ).toBe(false);
    expect(
      tools.fetch_work_items.schema.safeParse({ codes: Array(50).fill("WEB-1") }).success,
    ).toBe(true);
  });
});

describe("list_sub_work_items", () => {
  it("returns an epic's real children rather than leaving them to be guessed", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_sub_work_items.handler({ code: "WEB-1" });
    expect(client.resolveStory).toHaveBeenCalledWith("acme", "WEB-1");
    expect(client.subStories).toHaveBeenCalledWith("acme", "p1", "s1");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toMatchObject({ parent: "WEB-1", count: 1 });
    expect(parsed.items[0]).toMatchObject({ code: "WEB-2", title: "Child" });
  });

  it("reports an epic with no children as empty, not as an error", async () => {
    const client = fakeClient({ subStories: vi.fn(async () => []) });
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const parsed = JSON.parse((await tools.list_sub_work_items.handler({ code: "WEB-1" })).content[0].text);
    expect(parsed).toMatchObject({ count: 0, items: [] });
  });
});

describe("list_comments", () => {
  it("lists a story's comments", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_comments.handler({ code: "WEB-1" });
    expect(client.listComments).toHaveBeenCalledWith("acme", "p1", "s1");
    expect(res.content[0].text).toContain("hi");
  });
});

describe("delete_comment", () => {
  it("deletes by comment id", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.delete_comment.handler({ code: "WEB-1", comment_id: "c1" });
    expect(client.deleteComment).toHaveBeenCalledWith("acme", "p1", "s1", "c1");
  });
});

describe("attach_file", () => {
  it("uploads an image", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.attach_file.handler({ code: "WEB-1", title: "shot", file_name: "s.png", mime_type: "image/png", content: "iVBORw0KGgo=" });
    expect(client.uploadStoryDocument).toHaveBeenCalledWith(
      "acme",
      "p1",
      "s1",
      expect.objectContaining({ file_name: "s.png", mime_type: "image/png" }),
    );
  });
  it("uploads a pdf", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.attach_file.handler({ code: "WEB-1", title: "Spec", file_name: "spec.pdf", mime_type: "application/pdf", content: "JVBER..." });
    expect(client.uploadStoryDocument).toHaveBeenCalled();
    expect(res.content[0].text).toContain("spec.pdf");
  });
});

describe("list_projects", () => {
  it("lists the workspace's projects", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_projects.handler({});
    expect(client.listProjects).toHaveBeenCalledWith("acme");
    expect(res.content[0].text).toContain("WEB");
  });
});

describe("create_label", () => {
  it("creates a label with name+color", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.create_label.handler({ name: "bug", color: "#f00" });
    expect(client.createLabel).toHaveBeenCalledWith("acme", "p1", { name: "bug", color: "#f00" });
    expect(res.content[0].text).toContain("bug");
  });
});

describe("list_statuses", () => {
  it("lists project states", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_statuses.handler({});
    expect(client.listStates).toHaveBeenCalledWith("acme", "p1");
    expect(res.content[0].text).toContain("Todo");
  });
});

describe("list_users / get_user", () => {
  it("lists workspace members", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    const res = await tools.list_users.handler({});
    expect(client.listMembers).toHaveBeenCalledWith("acme");
    expect(res.content[0].text).toContain("Demo");
  });
  it("fetches a user by id", async () => {
    const client = fakeClient();
    const tools = buildTools(client, { repoFullName: "acme/web" });
    await tools.get_user.handler({ user_id: "u1" });
    expect(client.getUser).toHaveBeenCalledWith("u1");
  });
});

describe("tool registration", () => {
  it("exposes 27 tools", () => {
    const tools = buildTools(fakeClient(), { repoFullName: "acme/web" });
    expect(Object.keys(tools).length).toBe(27);
  });
});
